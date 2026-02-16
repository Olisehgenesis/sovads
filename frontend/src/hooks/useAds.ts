import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { parseUnits, formatEther, decodeEventLog } from 'viem';
import { sovAdsManagerAbi } from '../contract/abi';
import { chainId, SOVADS_MANAGER_ADDRESS } from '@/lib/chain-config';
import { getAllTokenAddresses, getTokenInfo } from '@/lib/tokens';
import type { Abi } from 'viem';

// Minimal ERC20 ABI for allowance/approve
const erc20Abi: Abi = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

// TypeScript interfaces for contract data structures
export interface CampaignVault {
  token: string;
  totalFunded: bigint;
  locked: bigint;
  claimed: bigint;
}

export interface Campaign {
  id: bigint;
  creator: string;
  startTime: bigint;
  endTime: bigint;
  metadata: string;
  active: boolean;
  paused: boolean;
  vault: CampaignVault;
}

export interface Claim {
  id: bigint;
  campaignId: bigint;
  claimant: string;
  amount: bigint;
  processed: boolean;
  rejected: boolean;
  createdAt: bigint;
  processedAt: bigint;
}

export interface Publisher {
  wallet: string;
  banned: boolean;
  subscriptionDate: bigint;
}

export interface UseAdsReturn {
  // Contract state
  campaignCount: bigint | undefined;
  claimCount: bigint | undefined;
  feePercent: bigint | undefined;
  paused: boolean | undefined;

  // Campaign functions
  getCampaign: (campaignId: number) => Promise<Campaign | undefined>;
  getCampaignVault: (campaignId: number) => Promise<CampaignVault | undefined>;

  // Publisher functions
  getPublisher: (publisherAddress: string) => Promise<Publisher | undefined>;
  isPublisher: (address: string) => Promise<boolean | undefined>;
  isViewer: (address: string) => Promise<boolean | undefined>;

  // Claim functions
  getClaim: (claimId: number) => Promise<Claim | undefined>;

  // Write functions
  createCampaign: (token: string, amount: string, duration: number, metadata: string) => Promise<{ hash: `0x${string}`; id: number }>;
  topUpCampaign: (campaignId: number, amount: string, tokenAddress: string) => Promise<string | undefined>;
  createClaim: (campaignId: number, amount: string) => Promise<void>;
  subscribePublisher: (sites: string[]) => Promise<void>;
  addSite: (site: string) => Promise<void>;
  recordInteraction: (campaignId: number, user: string, count: number, type: string) => Promise<void>;
  toggleCampaignPause: (campaignId: number) => Promise<void>;
  updateCampaignMetadata: (campaignId: number, metadata: string) => Promise<void>;
  extendCampaignDuration: (campaignId: number, additionalSeconds: number) => Promise<void>;

  // Utility functions
  getSupportedTokens: () => Promise<string[] | undefined>;

  // Loading and error states
  isLoading: boolean;
  error: string | null;
}

export const useAds = (): UseAdsReturn => {
  const { address: userAddress } = useAccount();
  const address = SOVADS_MANAGER_ADDRESS;
  const publicClient = usePublicClient({ chainId });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contract read hooks for basic state
  const { data: campaignCount } = useReadContract({
    address: address as `0x${string}`,
    abi: sovAdsManagerAbi as any,
    functionName: 'campaignCount',
    chainId,
  });

  const { data: claimCount } = useReadContract({
    address: address as `0x${string}`,
    abi: sovAdsManagerAbi as any,
    functionName: 'claimCount',
    chainId,
  });

  const { data: feePercent } = useReadContract({
    address: address as `0x${string}`,
    abi: sovAdsManagerAbi as any,
    functionName: 'feePercent',
    chainId,
  });

  const { data: paused } = useReadContract({
    address: address as `0x${string}`,
    abi: sovAdsManagerAbi as any,
    functionName: 'paused',
    chainId,
  });

  // Write contract hook
  const { writeContractAsync: writeContract } = useWriteContract();

  // Helper function to handle contract calls
  const handleContractCall = useCallback(async <T>(
    contractCall: () => Promise<T>,
    operation: string
  ): Promise<T | undefined> => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await contractCall();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${operation}`;
      setError(errorMessage);
      console.error(`Error in ${operation}:`, err);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Ensure ERC20 allowance is sufficient, approve if needed
  const ensureAllowance = useCallback(async (
    tokenAddress: string,
    owner: string,
    spender: string,
    requiredAmountWei: bigint
  ): Promise<void> => {
    if (!publicClient) throw new Error('Public client not available');

    const currentAllowance = (await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as `0x${string}`, spender as `0x${string}`],
    })) as bigint;

    if (currentAllowance >= requiredAmountWei) return;

    const approveTx = await writeContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      chainId,
      args: [spender as `0x${string}`, requiredAmountWei],
    });

    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }, [publicClient, writeContract]);

  // Read functions
  const getCampaign = useCallback(async (campaignId: number): Promise<Campaign | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'campaigns',
        args: [BigInt(campaignId)],
      });

      return result as unknown as Campaign;
    }, 'get campaign');
  }, [publicClient, handleContractCall, address]);

  const getCampaignVault = useCallback(async (campaignId: number): Promise<CampaignVault | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'getCampaignVault',
        args: [BigInt(campaignId)],
      });

      return result as unknown as CampaignVault;
    }, 'get campaign vault');
  }, [publicClient, handleContractCall, address]);

  const getPublisher = useCallback(async (publisherAddress: string): Promise<Publisher | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'publishers',
        args: [publisherAddress as `0x${string}`],
      });

      return result as unknown as Publisher;
    }, 'get publisher');
  }, [publicClient, handleContractCall, address]);

  const isPublisher = useCallback(async (publisherAddress: string): Promise<boolean | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'isPublisher',
        args: [publisherAddress as `0x${string}`],
      });

      return result as boolean;
    }, 'check if publisher');
  }, [publicClient, handleContractCall, address]);

  const isViewer = useCallback(async (viewerAddress: string): Promise<boolean | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'isViewer',
        args: [viewerAddress as `0x${string}`],
      });

      return result as boolean;
    }, 'check if viewer');
  }, [publicClient, handleContractCall, address]);

  const getClaim = useCallback(async (claimId: number): Promise<Claim | undefined> => {
    return handleContractCall(async () => {
      if (!publicClient) throw new Error('Public client not available');

      const result = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'claims',
        args: [BigInt(claimId)],
      });

      return result as unknown as Claim;
    }, 'get claim');
  }, [publicClient, handleContractCall, address]);

  // Utility functions
  const getSupportedTokens = useCallback(async (): Promise<string[] | undefined> => {
    return handleContractCall(async () => {
      return getAllTokenAddresses();
    }, 'get supported tokens');
  }, [handleContractCall]);

  // Write functions
  const createCampaign = useCallback(async (
    token: string,
    amount: string,
    duration: number,
    metadata: string
  ): Promise<{ hash: `0x${string}`; id: number }> => {
    const result = await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');
      if (!userAddress) throw new Error('Wallet not connected');

      const tokenInfo = getTokenInfo(token);
      const decimals = tokenInfo?.decimals ?? 18;
      const amountWei = parseUnits(amount, decimals);
      await ensureAllowance(token, userAddress, address as `0x${string}`, amountWei);

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'createCampaign',
        chainId,
        args: [token as `0x${string}`, amountWei, BigInt(duration), metadata],
      });

      let onChainId = 0;
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Find CampaignCreated event in logs
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: sovAdsManagerAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'CampaignCreated') {
              onChainId = Number((decoded.args as any).id);
              break;
            }
          } catch (e) {
            // Not our event or can't decode
          }
        }
      }

      return { hash: hash as `0x${string}`, id: onChainId };
    }, 'create campaign');
    if (!result) throw new Error('Failed to create campaign');
    return result as { hash: `0x${string}`; id: number };
  }, [writeContract, publicClient, handleContractCall, address, userAddress, ensureAllowance]);

  const topUpCampaign = useCallback(async (
    campaignId: number,
    amount: string,
    tokenAddress: string
  ): Promise<string | undefined> => {
    const result = await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');
      if (!userAddress) throw new Error('Wallet not connected');

      const tokenInfo = getTokenInfo(tokenAddress);
      const decimals = tokenInfo?.decimals ?? 18;
      const amountWei = parseUnits(amount, decimals);

      await ensureAllowance(tokenAddress, userAddress, address as `0x${string}`, amountWei);

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'topUpCampaign',
        chainId,
        args: [BigInt(campaignId), amountWei],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      return hash as string;
    }, 'top up campaign');

    return result as string | undefined;
  }, [writeContract, publicClient, handleContractCall, address, userAddress, ensureAllowance]);

  const createClaim = useCallback(async (
    campaignId: number,
    amount: string
  ): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'createClaim',
        chainId,
        args: [BigInt(campaignId), parseUnits(amount, 18)],
      });

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'create claim');
  }, [writeContract, publicClient, handleContractCall, address]);

  const subscribePublisher = useCallback(async (sites: string[]): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'subscribePublisher',
        chainId,
        args: [sites],
      });

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'subscribe publisher');
  }, [writeContract, publicClient, handleContractCall, address]);

  const addSite = useCallback(async (site: string): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'addSite',
        chainId,
        args: [site],
      });

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'add site');
  }, [writeContract, publicClient, handleContractCall, address]);

  const recordInteraction = useCallback(async (
    campaignId: number,
    user: string,
    count: number,
    type: string
  ): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');

      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'recordInteraction',
        chainId,
        args: [BigInt(campaignId), user as `0x${string}`, BigInt(count), type],
      });

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'record interaction');
  }, [writeContract, publicClient, handleContractCall, address]);

  const toggleCampaignPause = useCallback(async (campaignId: number): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');
      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'toggleCampaignPause',
        chainId,
        args: [BigInt(campaignId)],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'toggle campaign pause');
  }, [writeContract, publicClient, handleContractCall, address]);

  const updateCampaignMetadata = useCallback(async (campaignId: number, metadata: string): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');
      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'updateCampaignMetadata',
        chainId,
        args: [BigInt(campaignId), metadata],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'update campaign metadata');
  }, [writeContract, publicClient, handleContractCall, address]);

  const extendCampaignDuration = useCallback(async (campaignId: number, additionalSeconds: number): Promise<void> => {
    await handleContractCall(async () => {
      if (!writeContract) throw new Error('Contract write function not available');
      const hash = await writeContract({
        address: address as `0x${string}`,
        abi: sovAdsManagerAbi as any,
        functionName: 'extendCampaignDuration',
        chainId,
        args: [BigInt(campaignId), BigInt(additionalSeconds)],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
    }, 'extend campaign duration');
  }, [writeContract, publicClient, handleContractCall, address]);

  return {
    campaignCount: campaignCount as bigint | undefined,
    claimCount: claimCount as bigint | undefined,
    feePercent: feePercent as bigint | undefined,
    paused: paused as boolean | undefined,
    getCampaign,
    getCampaignVault,
    getPublisher,
    isPublisher,
    isViewer,
    getClaim,
    createCampaign,
    topUpCampaign,
    createClaim,
    subscribePublisher,
    addSite,
    recordInteraction,
    toggleCampaignPause,
    updateCampaignMetadata,
    extendCampaignDuration,
    getSupportedTokens,
    isLoading,
    error,
  };
};
