// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title SovAdsManager
 * @dev Unified Decentralized Ad Network Manager. Merges Vault, Valuation, and Claims.
 */
contract SovAdsManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ STRUCTS ============

    struct CampaignVault {
        address token;          // ERC20 token used for funding (GS, cUSD, etc.)
        uint256 totalFunded;    // Cumulative deposits
        uint256 locked;         // Funds tied to pending claims
        uint256 claimed;        // Funds already paid out
    }

    struct Valuation {
        uint256 impressions;
        uint256 clicks;
        uint256 valueAccrued;   // Earned token amount based on rates
        uint256 valueClaimed;   // Amount already converted into pending/completed claims
    }

    struct Campaign {
        uint256 id;
        address creator;
        uint256 startTime;
        uint256 endTime;
        string metadata;
        bool active;
        bool paused;
        CampaignVault vault;
    }

    struct Claim {
        uint256 id;
        uint256 campaignId;
        address claimant;
        uint256 amount;
        bool processed;
        bool rejected;
        uint256 createdAt;
        uint256 processedAt;
    }

    struct Publisher {
        address wallet;
        string[] sites;
        bool banned;
        uint256 subscriptionDate;
    }

    struct Viewer {
        address wallet;
        bool active;
        uint256 lastInteraction;
    }

    // ============ STATE VARIABLES ============

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => Claim) public claims;
    mapping(address => Publisher) public publishers;
    mapping(address => Viewer) public viewers;
    
    // Valuation: campaignId => userAddress => Valuation
    mapping(uint256 => mapping(address => Valuation)) public valuations;

    mapping(address => bool) public isPublisher;
    mapping(address => bool) public isViewer;
    mapping(address => bool) public supportedTokens;
    mapping(address => bool) public admins; // Dedicated admins/oracles

    uint256 public campaignCount;
    uint256 public claimCount;
    uint256 public feePercent = 500; // 5% in basis points (10000 = 100%)
    address public feeRecipient;

    // Default rates (can be campaign-specific in the future)
    uint256 public impressionRate = 1e15; // Example 0.001 tokens per impression
    uint256 public clickRate = 5e15;      // Example 0.005 tokens per click

    // ============ EVENTS ============

    event CampaignCreated(uint256 indexed id, address indexed creator, address indexed token, uint256 amount);
    event CampaignFunded(uint256 indexed id, uint256 amount);
    event CampaignPaused(uint256 indexed id, bool paused);
    event CampaignMetadataUpdated(uint256 indexed id, string metadata);
    event CampaignDurationExtended(uint256 indexed id, uint256 newEndTime);
    event InteractionRecorded(uint256 indexed campaignId, address indexed user, uint256 value, string interactionType);
    event ClaimCreated(uint256 indexed claimId, uint256 indexed campaignId, address indexed claimant, uint256 amount);
    event ClaimProcessed(uint256 indexed claimId, address indexed claimant, uint256 amount, bool approved);
    event PublisherSubscribed(address indexed publisher, string[] sites);
    event SiteAdded(address indexed publisher, string site);
    event UserBanned(address indexed user);
    event UserUnbanned(address indexed user);
    event RateUpdated(string rateType, uint256 newValue);

    // ============ MODIFIERS ============

    modifier onlyAdmin() {
        require(msg.sender == owner() || admins[msg.sender], "Not admin");
        _;
    }

    modifier campaignActive(uint256 _campaignId) {
        require(campaigns[_campaignId].active && !campaigns[_campaignId].paused, "Campaign inactive");
        require(block.timestamp <= campaigns[_campaignId].endTime, "Campaign expired");
        _;
    }

    // ============ CONSTRUCTOR ============

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    // ============ CAMPAIGN FUNCTIONS ============

    function createCampaign(
        address _token,
        uint256 _amount,
        uint256 _duration,
        string calldata _metadata
    ) external whenNotPaused nonReentrant {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(_duration > 0, "Duration must be > 0");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        campaignCount++;
        campaigns[campaignCount] = Campaign({
            id: campaignCount,
            creator: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            metadata: _metadata,
            active: true,
            paused: false,
            vault: CampaignVault({
                token: _token,
                totalFunded: _amount,
                locked: 0,
                claimed: 0
            })
        });

        emit CampaignCreated(campaignCount, msg.sender, _token, _amount);
    }

    function topUpCampaign(uint256 _campaignId, uint256 _amount) 
        external 
        nonReentrant 
    {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.active, "Campaign inactive");
        require(_amount > 0, "Amount must be > 0");

        IERC20(campaign.vault.token).safeTransferFrom(msg.sender, address(this), _amount);
        campaign.vault.totalFunded += _amount;

        emit CampaignFunded(_campaignId, _amount);
    }

    function toggleCampaignPause(uint256 _campaignId) external {
        Campaign storage campaign = campaigns[_campaignId];
        require(msg.sender == campaign.creator || admins[msg.sender] || msg.sender == owner(), "Not authorized");
        
        campaign.paused = !campaign.paused;
        emit CampaignPaused(_campaignId, campaign.paused);
    }

    function updateCampaignMetadata(uint256 _campaignId, string calldata _metadata) external {
        Campaign storage campaign = campaigns[_campaignId];
        require(msg.sender == campaign.creator || admins[msg.sender], "Not authorized");
        
        campaign.metadata = _metadata;
        emit CampaignMetadataUpdated(_campaignId, _metadata);
    }

    function extendCampaignDuration(uint256 _campaignId, uint256 _additionalDuration) external {
        Campaign storage campaign = campaigns[_campaignId];
        require(msg.sender == campaign.creator || admins[msg.sender], "Not authorized");
        require(_additionalDuration > 0, "Duration must be > 0");
        
        campaign.endTime += _additionalDuration;
        emit CampaignDurationExtended(_campaignId, campaign.endTime);
    }

    // ============ VALUATION LAYER ============

    function recordInteraction(
        uint256 _campaignId,
        address _user,
        uint256 _count,
        string calldata _type
    ) external onlyAdmin {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.active, "Campaign inactive");
        
        uint256 value;
        if (keccak256(abi.encodePacked(_type)) == keccak256(abi.encodePacked("IMPRESSION"))) {
            value = _count * impressionRate;
            valuations[_campaignId][_user].impressions += _count;
        } else if (keccak256(abi.encodePacked(_type)) == keccak256(abi.encodePacked("CLICK"))) {
            value = _count * clickRate;
            valuations[_campaignId][_user].clicks += _count;
        } else {
            revert("Invalid interaction type");
        }

        valuations[_campaignId][_user].valueAccrued += value;
        emit InteractionRecorded(_campaignId, _user, value, _type);
    }

    // ============ CLAIM FLOW ============

    function createClaim(uint256 _campaignId, uint256 _amount) external nonReentrant {
        Valuation storage v = valuations[_campaignId][msg.sender];
        Campaign storage c = campaigns[_campaignId];
        
        uint256 availableToClaim = v.valueAccrued - v.valueClaimed;
        require(_amount <= availableToClaim, "Exceeds accrued value");

        uint256 vaultAvailable = c.vault.totalFunded - c.vault.claimed - c.vault.locked;
        require(_amount <= vaultAvailable, "Insufficient vault funds");

        claimCount++;
        claims[claimCount] = Claim({
            id: claimCount,
            campaignId: _campaignId,
            claimant: msg.sender,
            amount: _amount,
            processed: false,
            rejected: false,
            createdAt: block.timestamp,
            processedAt: 0
        });

        v.valueClaimed += _amount;
        c.vault.locked += _amount;

        emit ClaimCreated(claimCount, _campaignId, msg.sender, _amount);
    }

    function processClaim(uint256 _claimId, bool _approve) external onlyAdmin nonReentrant {
        Claim storage claim = claims[_claimId];
        require(!claim.processed, "Already processed");
        
        Campaign storage c = campaigns[claim.campaignId];
        Valuation storage v = valuations[claim.campaignId][claim.claimant];

        claim.processed = true;
        claim.processedAt = block.timestamp;
        c.vault.locked -= claim.amount;

        if (_approve) {
            uint256 fee = (claim.amount * feePercent) / 10000;
            uint256 netAmount = claim.amount - fee;

            c.vault.claimed += claim.amount;
            
            if (fee > 0) {
                IERC20(c.vault.token).safeTransfer(feeRecipient, fee);
            }
            IERC20(c.vault.token).safeTransfer(claim.claimant, netAmount);
        } else {
            claim.rejected = true;
            v.valueClaimed -= claim.amount; // Allow user to claim this value again
        }

        emit ClaimProcessed(_claimId, claim.claimant, claim.amount, _approve);
    }

    /**
     * @dev Manual disbursement of funds from a campaign (admin only).
     * Bypasses the claim flow for adjustments/direct payouts.
     */
    function disburseFunds(uint256 _campaignId, address _recipient, uint256 _amount) 
        external 
        onlyAdmin 
        nonReentrant 
    {
        Campaign storage c = campaigns[_campaignId];
        require(c.active, "Campaign inactive");
        
        uint256 vaultAvailable = c.vault.totalFunded - c.vault.claimed - c.vault.locked;
        require(_amount <= vaultAvailable, "Insufficient vault funds");

        c.vault.claimed += _amount;
        IERC20(c.vault.token).safeTransfer(_recipient, _amount);

        // Optional: emit an event
    }

    // ============ PUBLISHER/VIEWER SETUP ============

    function subscribePublisher(string[] calldata _sites) external whenNotPaused {
        require(!isPublisher[msg.sender], "Already subscribed");
        publishers[msg.sender] = Publisher({
            wallet: msg.sender,
            sites: _sites,
            banned: false,
            subscriptionDate: block.timestamp
        });
        isPublisher[msg.sender] = true;
        emit PublisherSubscribed(msg.sender, _sites);
    }

    function addSite(string calldata _site) external {
        require(isPublisher[msg.sender], "Not a publisher");
        publishers[msg.sender].sites.push(_site);
        emit SiteAdded(msg.sender, _site);
    }

    // ============ ADMIN FUNCTIONS ============

    function addSupportedToken(address _token) external onlyOwner {
        supportedTokens[_token] = true;
    }

    function setAdmin(address _admin, bool _status) external onlyOwner {
        admins[_admin] = _status;
    }

    function setRates(uint256 _impressionRate, uint256 _clickRate) external onlyOwner {
        impressionRate = _impressionRate;
        clickRate = _clickRate;
        emit RateUpdated("IMPRESSION", _impressionRate);
        emit RateUpdated("CLICK", _clickRate);
    }

    function setFeeConfig(address _recipient, uint256 _bps) external onlyOwner {
        require(_recipient != address(0), "Invalid address");
        require(_bps <= 2000, "Fee too high"); // Max 20%
        feeRecipient = _recipient;
        feePercent = _bps;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ============ VIEW FUNCTIONS ============

    function getCampaignVault(uint256 _campaignId) external view returns (CampaignVault memory) {
        return campaigns[_campaignId].vault;
    }

    function getBalanceInfo(uint256 _campaignId, address _user) 
        external 
        view 
        returns (uint256 accrued, uint256 claimed, uint256 pending) 
    {
        Valuation storage v = valuations[_campaignId][_user];
        return (v.valueAccrued, v.valueClaimed, v.valueAccrued - v.valueClaimed);
    }
}
