// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SuperTokenV1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";
import {ISuperfluidPool, PoolConfig} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuardUpgradeable} from "../utils/ReentrancyGuardUpgradeable.sol";

// OpenZeppelin Upgradeable
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SovAdsStreaming
 * @notice Unified contract for ad campaign streaming, publisher rewards, and G$ staking
 * @dev Uses Superfluid Money Streaming + Distribution Pools for automated fund distribution
 * 
 * Fee Distribution Model:
 * - 10% Admin Fee: Instant transfer on campaign creation
 * - 10% Daily Admin Stream: Superfluid stream to admin over campaign duration
 * - 60% Publisher Rewards: Superfluid Distribution Pool proportional to performance
 * - 20% Staker Rewards: Superfluid Distribution Pool proportional to G$ staked + time modifier
 *
 * @dev Deployed as a UUPS Upgradeable Proxy
 */
contract SovAdsStreaming is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable 
{
    using SuperTokenV1Library for ISuperToken;

    // ============ CONSTANTS ============

    uint256 public constant ADMIN_FEE_BPS = 1000;         // 10%
    uint256 public constant DAILY_STREAM_BPS = 1000;      // 10%
    uint256 public constant PUBLISHER_REWARDS_BPS = 6000;  // 60%
    uint256 public constant STAKER_REWARDS_BPS = 2000;     // 20%
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // ============ STRUCTS ============

    struct StreamingCampaign {
        uint256 id;
        address creator;
        uint256 totalBudget;
        uint256 adminFee;           // 10% instant
        uint256 dailyStreamBudget;  // 10% streamed to admin
        uint256 publisherBudget;    // 60% for publisher pool
        uint256 stakerBudget;       // 20% for staker pool
        uint256 startTime;
        uint256 endTime;
        string metadata;
        bool active;
        bool publisherFlowActive;
        bool adminStreamActive;
        bool stakerFlowActive;
        ISuperfluidPool publisherPool;
        int96 adminFlowRate;
        int96 publisherFlowRate;
        int96 stakerFlowRate;
        uint256 unspentBalance;
    }

    struct StakerInfo {
        uint256 stakedAmount;
        uint256 stakingTime;
    }

    // ============ STATE VARIABLES ============

    /// @notice GoodDollar Super Token on Celo
    ISuperToken public goodDollar;

    /// @notice Admin/treasury address that receives fees and daily streams
    address public admin;

    /// @notice Campaign storage
    mapping(uint256 => StreamingCampaign) public campaigns;
    uint256 public campaignCount;

    /// @notice Cumulative active flow rates
    int96 public totalAdminFlowRate;
    int96 public totalStakerFlowRate;

    /// @notice Staking state
    mapping(address => StakerInfo) public stakers;
    uint256 public totalStaked;
    ISuperfluidPool public stakerPool;

    /// @notice Publisher tracking
    mapping(address => bool) public isPublisher;
    mapping(address => bool) public admins;

    /// @notice Campaign publisher tracking (campaignId => publisher => units)
    mapping(uint256 => mapping(address => uint128)) public publisherUnits;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address recipient,uint256 amount,bytes32 claimRef,uint256 nonce,uint256 deadline)");
    bytes32 public DOMAIN_SEPARATOR;
    mapping(address => bool) public operators;
    mapping(bytes32 => bool) public usedClaimRef;
    mapping(address => uint256) public nonces;

    // ============ EVENTS ============

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 totalBudget,
        uint256 adminFee,
        uint256 publisherBudget,
        uint256 stakerBudget
    );
    event CampaignStopped(uint256 indexed id);
    event AdminStreamStarted(uint256 indexed id, int96 flowRate);
    event PublisherFlowStarted(uint256 indexed id, int96 flowRate);
    event PublisherUnitsUpdated(uint256 indexed id, address indexed publisher, uint128 units);
    event StakerFlowStarted(uint256 indexed id, int96 flowRate);
    event Staked(address indexed staker, uint256 amount, uint128 newUnits);
    event Unstaked(address indexed staker, uint256 amount, uint128 newUnits);
    event UnusedFundsWithdrawn(uint256 indexed id, address indexed creator, uint256 amount);
    event StakerUnitsUpdated(address indexed staker, uint128 newUnits);
    event CampaignTopUp(uint256 indexed campaignId, address indexed sender, uint256 amount);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event ClaimWithSignature(address indexed recipient, uint256 amount, bytes32 indexed claimRef, uint256 nonce, uint256 deadline, address indexed signer);

    // ============ MODIFIERS ============

    modifier onlyAdmin() {
        require(msg.sender == owner() || msg.sender == admin || admins[msg.sender], "Not admin");
        _;
    }

    modifier campaignExists(uint256 _campaignId) {
        require(_campaignId > 0 && _campaignId <= campaignCount, "Campaign does not exist");
        _;
    }

    modifier campaignActive(uint256 _campaignId) {
        require(campaigns[_campaignId].active, "Campaign not active");
        _;
    }

    // ============ INITIALIZATION ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the proxy contract
     * @param _goodDollar GoodDollar Super Token address on Celo
     * @param _admin Admin/treasury address for fees and streams
     */
    function initialize(ISuperToken _goodDollar, address _admin) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();

        require(address(_goodDollar) != address(0), "Invalid GoodDollar address");
        require(_admin != address(0), "Invalid admin address");

        goodDollar = _goodDollar;
        admin = _admin;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SovAdsStreaming")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        // Create the global staker rewards pool
        // This pool receives 20% from each campaign and distributes proportionally to stakers
        stakerPool = _goodDollar.createPool(
            address(this),
            PoolConfig({
                transferabilityForUnitsOwner: false,
                distributionFromAnyAddress: true
            })
        );
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _toInt96(uint256 x) internal pure returns (int96) {
        require(x <= uint256(uint96(type(int96).max)), "Flow rate overflow");
        return int96(int256(x));
    }

    // ============ CAMPAIGN FUNCTIONS ============

    function createStreamingCampaign(
        uint256 _amount,
        uint256 _duration,
        string calldata _metadata
    ) external whenNotPaused nonReentrant returns (uint256 campaignId) {
        require(_amount > 0, "Amount must be > 0");
        require(_duration > 0, "Duration must be > 0");
        require(bytes(_metadata).length > 0, "Metadata required");

        goodDollar.transferFrom(msg.sender, address(this), _amount);

        uint256 adminFee = (_amount * ADMIN_FEE_BPS) / BPS_DENOMINATOR;
        uint256 dailyStreamBudget = (_amount * DAILY_STREAM_BPS) / BPS_DENOMINATOR;
        uint256 publisherBudget = (_amount * PUBLISHER_REWARDS_BPS) / BPS_DENOMINATOR;
        uint256 stakerBudget = (_amount * STAKER_REWARDS_BPS) / BPS_DENOMINATOR;

        if (adminFee > 0) {
            goodDollar.transfer(admin, adminFee);
        }

        ISuperfluidPool publisherPool = goodDollar.createPool(
            address(this),
            PoolConfig({
                transferabilityForUnitsOwner: false,
                distributionFromAnyAddress: true
            })
        );

        campaignCount++;
        campaignId = campaignCount;

        campaigns[campaignId] = StreamingCampaign({
            id: campaignId,
            creator: msg.sender,
            totalBudget: _amount,
            adminFee: adminFee,
            dailyStreamBudget: dailyStreamBudget,
            publisherBudget: publisherBudget,
            stakerBudget: stakerBudget,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            metadata: _metadata,
            active: true,
            publisherFlowActive: false,
            adminStreamActive: false,
            stakerFlowActive: false,
            publisherPool: publisherPool,
            adminFlowRate: 0,
            publisherFlowRate: 0,
            stakerFlowRate: 0,
            unspentBalance: dailyStreamBudget + publisherBudget + stakerBudget
        });

        emit CampaignCreated(campaignId, msg.sender, _amount, adminFee, publisherBudget, stakerBudget);
        return campaignId;
    }

    function activateDailyStream(uint256 _campaignId)
        external
        onlyAdmin
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(!campaign.adminStreamActive, "Admin stream already active");

        uint256 duration = campaign.endTime - block.timestamp;
        require(duration > 0, "Campaign expired");

        int96 flowRate = _toInt96(campaign.dailyStreamBudget / duration);
        require(flowRate > 0, "Flow rate too small");

        campaign.adminFlowRate = flowRate;
        totalAdminFlowRate += flowRate;
        goodDollar.flow(admin, totalAdminFlowRate);

        campaign.adminStreamActive = true;
        emit AdminStreamStarted(_campaignId, flowRate);
    }

    function topUpCampaign(uint256 _campaignId, uint256 _amount)
        external
        whenNotPaused
        nonReentrant
        campaignExists(_campaignId)
    {
        require(_amount > 0, "Amount must be > 0");

        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(campaign.active, "Campaign not active");
        require(
            msg.sender == campaign.creator || msg.sender == admin || msg.sender == owner(),
            "Not authorized"
        );

        uint256 remaining = campaign.endTime > block.timestamp
            ? campaign.endTime - block.timestamp
            : 0;
        require(remaining > 0, "Campaign expired");

        goodDollar.transferFrom(msg.sender, address(this), _amount);

        uint256 adminFee = (_amount * ADMIN_FEE_BPS) / BPS_DENOMINATOR;
        uint256 dailyStreamBudget = (_amount * DAILY_STREAM_BPS) / BPS_DENOMINATOR;
        uint256 publisherBudget = (_amount * PUBLISHER_REWARDS_BPS) / BPS_DENOMINATOR;
        uint256 stakerBudget = (_amount * STAKER_REWARDS_BPS) / BPS_DENOMINATOR;

        if (adminFee > 0) {
            goodDollar.transfer(admin, adminFee);
        }

        campaign.totalBudget += _amount;
        campaign.adminFee += adminFee;
        campaign.dailyStreamBudget += dailyStreamBudget;
        campaign.publisherBudget += publisherBudget;
        campaign.stakerBudget += stakerBudget;
        campaign.unspentBalance += dailyStreamBudget + publisherBudget + stakerBudget;

        if (campaign.adminStreamActive) {
            int96 newAdminFlowRate = _toInt96(campaign.dailyStreamBudget / remaining);
            require(newAdminFlowRate > 0, "Admin flow rate too small");
            totalAdminFlowRate = totalAdminFlowRate - campaign.adminFlowRate + newAdminFlowRate;
            campaign.adminFlowRate = newAdminFlowRate;
            goodDollar.flow(admin, totalAdminFlowRate);
        }

        if (campaign.publisherFlowActive) {
            int96 newPublisherFlowRate = _toInt96(campaign.publisherBudget / remaining);
            require(newPublisherFlowRate > 0, "Publisher flow rate too small");
            campaign.publisherFlowRate = newPublisherFlowRate;
            goodDollar.distributeFlow(campaign.publisherPool, newPublisherFlowRate);
        }

        if (campaign.stakerFlowActive) {
            int96 newStakerFlowRate = _toInt96(campaign.stakerBudget / remaining);
            require(newStakerFlowRate > 0, "Staker flow rate too small");
            totalStakerFlowRate = totalStakerFlowRate - campaign.stakerFlowRate + newStakerFlowRate;
            campaign.stakerFlowRate = newStakerFlowRate;
            goodDollar.distributeFlow(stakerPool, totalStakerFlowRate);
        }

        emit CampaignTopUp(_campaignId, msg.sender, _amount);
    }

    function claimWithSignature(
        address recipient,
        uint256 amount,
        bytes32 claimRef,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(block.timestamp <= deadline, "Claim expired");
        require(!usedClaimRef[claimRef], "Claim already used");
        require(nonce == nonces[recipient], "Invalid nonce");

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                recipient,
                amount,
                claimRef,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = ECDSA.recover(digest, signature);
        require(operators[signer], "Invalid claim signer");

        usedClaimRef[claimRef] = true;
        nonces[recipient]++;

        require(goodDollar.balanceOf(address(this)) >= amount, "Insufficient contract balance");
        goodDollar.transfer(recipient, amount);

        emit ClaimWithSignature(recipient, amount, claimRef, nonce, deadline, signer);
    }

    function addOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid operator");
        require(!operators[_operator], "Operator already added");
        operators[_operator] = true;
        emit OperatorAdded(_operator);
    }

    function removeOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid operator");
        require(operators[_operator], "Operator not found");
        operators[_operator] = false;
        emit OperatorRemoved(_operator);
    }

    function startPublisherFlow(uint256 _campaignId)
        external
        onlyAdmin
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(!campaign.publisherFlowActive, "Publisher flow already active");

        uint256 duration = campaign.endTime - block.timestamp;
        require(duration > 0, "Campaign expired");

        int96 flowRate = _toInt96(campaign.publisherBudget / duration);
        require(flowRate > 0, "Flow rate too small");

        campaign.publisherFlowRate = flowRate;
        goodDollar.distributeFlow(campaign.publisherPool, flowRate);

        campaign.publisherFlowActive = true;
        emit PublisherFlowStarted(_campaignId, flowRate);
    }

    function startStakerFlow(uint256 _campaignId)
        external
        onlyAdmin
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(!campaign.stakerFlowActive, "Staker flow already active");
        require(totalStaked > 0, "No stakers available");

        uint256 duration = campaign.endTime - block.timestamp;
        require(duration > 0, "Campaign expired");

        int96 flowRate = _toInt96(campaign.stakerBudget / duration);
        require(flowRate > 0, "Flow rate too small");

        campaign.stakerFlowRate = flowRate;
        totalStakerFlowRate += flowRate;
        goodDollar.distributeFlow(stakerPool, totalStakerFlowRate);

        campaign.stakerFlowActive = true;
        emit StakerFlowStarted(_campaignId, flowRate);
    }

    function updatePublisherUnits(uint256 _campaignId, address _publisher, uint128 _units)
        external
        onlyAdmin
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        require(_publisher != address(0), "Invalid publisher");
        StreamingCampaign storage campaign = campaigns[_campaignId];

        campaign.publisherPool.updateMemberUnits(_publisher, _units);
        publisherUnits[_campaignId][_publisher] = _units;

        emit PublisherUnitsUpdated(_campaignId, _publisher, _units);
    }

    function _deactivateCampaign(uint256 _campaignId) internal {
        StreamingCampaign storage campaign = campaigns[_campaignId];

        if (campaign.adminStreamActive) {
            totalAdminFlowRate -= campaign.adminFlowRate;
            campaign.adminFlowRate = 0;
            goodDollar.flow(admin, totalAdminFlowRate);
            campaign.adminStreamActive = false;
        }

        if (campaign.publisherFlowActive) {
            campaign.publisherFlowRate = 0;
            goodDollar.distributeFlow(campaign.publisherPool, 0);
            campaign.publisherFlowActive = false;
        }

        if (campaign.stakerFlowActive) {
            totalStakerFlowRate -= campaign.stakerFlowRate;
            campaign.stakerFlowRate = 0;
            goodDollar.distributeFlow(stakerPool, totalStakerFlowRate);
            campaign.stakerFlowActive = false;
        }

        campaign.active = false;
        emit CampaignStopped(_campaignId);
    }

    function stopCampaign(uint256 _campaignId)
        external
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(
            msg.sender == campaign.creator || msg.sender == admin || msg.sender == owner(),
            "Not authorized"
        );
        _deactivateCampaign(_campaignId);
    }

    function finalizeCampaign(uint256 _campaignId)
        external
        campaignExists(_campaignId)
        campaignActive(_campaignId)
    {
        require(block.timestamp > campaigns[_campaignId].endTime, "Campaign not yet ended");
        _deactivateCampaign(_campaignId);
    }

    function withdrawUnused(uint256 _campaignId)
        external
        nonReentrant
        campaignExists(_campaignId)
    {
        StreamingCampaign storage campaign = campaigns[_campaignId];
        require(msg.sender == campaign.creator, "Not campaign creator");
        require(block.timestamp > campaign.endTime || !campaign.active, "Campaign still active");

        if (campaign.active) {
            if (campaign.adminStreamActive) {
                totalAdminFlowRate -= campaign.adminFlowRate;
                campaign.adminFlowRate = 0;
                goodDollar.flow(admin, totalAdminFlowRate);
                campaign.adminStreamActive = false;
            }
            if (campaign.publisherFlowActive) {
                campaign.publisherFlowRate = 0;
                goodDollar.distributeFlow(campaign.publisherPool, 0);
                campaign.publisherFlowActive = false;
            }
            if (campaign.stakerFlowActive) {
                totalStakerFlowRate -= campaign.stakerFlowRate;
                campaign.stakerFlowRate = 0;
                goodDollar.distributeFlow(stakerPool, totalStakerFlowRate);
                campaign.stakerFlowActive = false;
            }
            campaign.active = false;
        }

        uint256 remainingBalance = campaign.unspentBalance;
        campaign.unspentBalance = 0;
        if (remainingBalance > 0) {
            goodDollar.transfer(campaign.creator, remainingBalance);
            emit UnusedFundsWithdrawn(_campaignId, campaign.creator, remainingBalance);
        }
    }

    // ============ STAKING FUNCTIONS ============

    /**
     * @notice Calculates the Time-Accrued Multiplier based units for a staker
     * @dev Units = Base amount * (1 + 5% per day), capped at 3x (after 40 days)
     */
    function _calculateUnits(address _staker) internal view returns (uint128) {
        StakerInfo memory info = stakers[_staker];
        if (info.stakedAmount == 0) return 0;

        uint256 baseUnits = info.stakedAmount / 1e12;
        uint256 daysStaked = (block.timestamp - info.stakingTime) / 1 days;
        
        // Multiplier: 100 + (daysStaked * 5). Cap at 300 (3x maximum multiplier)
        uint256 multiplier = 100 + (daysStaked * 5);
        if (multiplier > 300) {
            multiplier = 300;
        }

        return uint128((baseUnits * multiplier) / 100);
    }

    /**
     * @notice Stake G$ tokens. Resets the time-multiplier multiplier.
     */
    function stake(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Amount must be > 0");

        goodDollar.transferFrom(msg.sender, address(this), _amount);

        stakers[msg.sender].stakedAmount += _amount;
        stakers[msg.sender].stakingTime = block.timestamp; // Reset time-accrued multiplier on stake
        totalStaked += _amount;

        uint128 newUnits = _calculateUnits(msg.sender);
        require(newUnits > 0, "Stake amount too small for units");

        stakerPool.updateMemberUnits(msg.sender, newUnits);

        emit Staked(msg.sender, _amount, newUnits);
    }

    /**
     * @notice Unstake G$ tokens. Resets the time-multiplier for remaining stake.
     */
    function unstake(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(stakers[msg.sender].stakedAmount >= _amount, "Insufficient staked balance");

        stakers[msg.sender].stakedAmount -= _amount;
        stakers[msg.sender].stakingTime = block.timestamp; // Penalty: unstaking resets your time multiplier
        totalStaked -= _amount;

        uint128 newUnits = _calculateUnits(msg.sender);
        stakerPool.updateMemberUnits(msg.sender, newUnits);

        goodDollar.transfer(msg.sender, _amount);

        emit Unstaked(msg.sender, _amount, newUnits);
    }

    /**
     * @notice Allows a staker to manually sync their distribution pool units based on accrued time
     */
    function updateStakingMultiplier() external whenNotPaused nonReentrant {
        require(stakers[msg.sender].stakedAmount > 0, "No stake to update");
        
        uint128 newUnits = _calculateUnits(msg.sender);
        stakerPool.updateMemberUnits(msg.sender, newUnits);
        
        emit StakerUnitsUpdated(msg.sender, newUnits);
    }

    // ============ ADMIN FUNCTIONS ============

    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Invalid admin");
        admin = _admin;
    }

    function setAdminRole(address _admin, bool _status) external onlyOwner {
        admins[_admin] = _status;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ VIEW FUNCTIONS ============

    function getCampaign(uint256 _campaignId) external view returns (StreamingCampaign memory) {
        return campaigns[_campaignId];
    }

    function getStakerInfo(address _staker) external view returns (uint256 stakedAmount, uint256 stakingTime, uint128 units) {
        StakerInfo memory info = stakers[_staker];
        uint128 currentUnits = _calculateUnits(_staker);
        return (info.stakedAmount, info.stakingTime, currentUnits);
    }

    function getPublisherUnits(uint256 _campaignId, address _publisher) external view returns (uint128) {
        return publisherUnits[_campaignId][_publisher];
    }

    function getCampaignRemainingBudget(uint256 _campaignId)
        external
        view
        campaignExists(_campaignId)
        returns (uint256 publisherBudget, uint256 stakerBudget, uint256 dailyStreamBudget, bool isActive)
    {
        StreamingCampaign memory campaign = campaigns[_campaignId];
        return (campaign.publisherBudget, campaign.stakerBudget, campaign.dailyStreamBudget, campaign.active);
    }
}
