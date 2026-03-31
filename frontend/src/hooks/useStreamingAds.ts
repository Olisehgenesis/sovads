import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { parseUnits, formatEther, decodeEventLog } from 'viem';
import { sovAdsStreamingAbi } from '../contract/sovAdsStreamingAbi';
import { chainId, SOVADS_STREAMING_ADDRESS, GOODDOLLAR_ADDRESS } from '@/lib/chain-config';
import { getTokenInfo } from '@/lib/tokens';
import type { Abi } from 'viem';

// Minimal ERC20 ABI for SuperToken (G$) operations
const superTokenAbi: Abi = [
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

export interface StreamingCampaign {
    id: bigint;
    creator: string;
    totalBudget: bigint;
    adminFee: bigint;
    dailyStreamBudget: bigint;
    publisherBudget: bigint;
    stakerBudget: bigint;
    startTime: bigint;
    endTime: bigint;
    metadata: string;
    active: boolean;
    publisherFlowActive: boolean;
    adminStreamActive: boolean;
    stakerFlowActive: boolean;
    publisherPool: string;
}

export interface StakerInfo {
    stakedAmount: bigint;
    stakingTime: bigint;
    units: bigint;
}

export type StakingPhase = 'idle' | 'approving' | 'staking';

export const useStreamingAds = () => {
    const { address: userAddress } = useAccount();
    const address = SOVADS_STREAMING_ADDRESS;
    const publicClient = usePublicClient({ chainId });
    const [isLoading, setIsLoading] = useState(false);
    const [stakingPhase, setStakingPhase] = useState<StakingPhase>('idle');
    const [error, setError] = useState<string | null>(null);

    const { writeContractAsync: writeContract } = useWriteContract();

    // Helper for contract calls
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

    const ensureAllowance = useCallback(async (
        tokenAddress: string,
        owner: string,
        spender: string,
        requiredAmountWei: bigint
    ): Promise<void> => {
        if (!publicClient) throw new Error('Public client not available');

        const currentAllowance = (await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: superTokenAbi,
            functionName: 'allowance',
            args: [owner as `0x${string}`, spender as `0x${string}`],
        })) as bigint;

        if (currentAllowance >= requiredAmountWei) return;

        const hash = await writeContract({
            account: owner as `0x${string}`,
            address: tokenAddress as `0x${string}`,
            abi: superTokenAbi,
            functionName: 'approve',
            chainId,
            args: [spender as `0x${string}`, requiredAmountWei],
        });

        await publicClient.waitForTransactionReceipt({ hash });
    }, [publicClient, writeContract]);

    // --- Read Functions ---

    const getCampaign = useCallback(async (campaignId: number): Promise<StreamingCampaign | undefined> => {
        return handleContractCall(async () => {
            if (!publicClient) throw new Error('Public client not available');
            const result = await publicClient.readContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'getCampaign',
                args: [BigInt(campaignId)],
            });
            return result as unknown as StreamingCampaign;
        }, 'get campaign');
    }, [publicClient, handleContractCall, address]);

    const getStakerInfo = useCallback(async (stakerAddress: string): Promise<StakerInfo | undefined> => {
        return handleContractCall(async () => {
            if (!publicClient) throw new Error('Public client not available');
            const result = await publicClient.readContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'getStakerInfo',
                args: [stakerAddress as `0x${string}`],
            });
            const [stakedAmount, stakingTime, units] = result as [bigint, bigint, bigint];
            return { stakedAmount, stakingTime, units };
        }, 'get staker info');
    }, [publicClient, handleContractCall, address]);

    const { data: campaignCount } = useReadContract({
        address: address as `0x${string}`,
        abi: sovAdsStreamingAbi,
        functionName: 'campaignCount',
        chainId,
    });

    const { data: totalStaked } = useReadContract({
        address: address as `0x${string}`,
        abi: sovAdsStreamingAbi,
        functionName: 'totalStaked',
        chainId,
    });

    const { data: isProtocolPaused } = useReadContract({
        address: address as `0x${string}`,
        abi: sovAdsStreamingAbi,
        functionName: 'paused',
        chainId,
    });

    // --- Write Functions ---

    const pause = useCallback(async () => {
        return handleContractCall(async () => {
            if (!writeContract) throw new Error('Wallet not connected');
            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'pause',
                chainId,
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'pause protocol');
    }, [writeContract, publicClient, handleContractCall, address]);

    const unpause = useCallback(async () => {
        return handleContractCall(async () => {
            if (!writeContract) throw new Error('Wallet not connected');
            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'unpause',
                chainId,
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'unpause protocol');
    }, [writeContract, publicClient, handleContractCall, address]);

    const updatePublisherUnits = useCallback(async (campaignId: number, publisher: string, units: string) => {
        return handleContractCall(async () => {
            if (!writeContract) throw new Error('Wallet not connected');
            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'updatePublisherUnits',
                chainId,
                args: [BigInt(campaignId), publisher as `0x${string}`, BigInt(units)],
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'update publisher units');
    }, [writeContract, publicClient, handleContractCall, address]);

    const createStreamingCampaign = useCallback(async (
        amount: string,
        durationInSeconds: number,
        metadata: string
    ): Promise<{ hash: `0x${string}`; id: number }> => {
        const result = await handleContractCall(async () => {
            if (!writeContract || !userAddress) throw new Error('Wallet not connected');

            const amountWei = parseUnits(amount, 18); // G$ has 18 decimals as SuperToken

            // 1. Ensure allowance for G$
            await ensureAllowance(GOODDOLLAR_ADDRESS, userAddress, address as `0x${string}`, amountWei);

            // 2. Create campaign
            const hash = await writeContract({
                account: userAddress as `0x${string}`,
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'createStreamingCampaign',
                chainId,
                args: [amountWei, BigInt(durationInSeconds), metadata],
            });

            let onChainId = 0;
            if (publicClient) {
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                for (const log of receipt.logs) {
                    try {
                        const decoded = decodeEventLog({
                            abi: sovAdsStreamingAbi,
                            data: log.data,
                            topics: log.topics,
                        });
                        if (decoded.eventName === 'CampaignCreated') {
                            onChainId = Number((decoded.args as any).id);
                            break;
                        }
                    } catch (e) { }
                }
            }

            return { hash, id: onChainId };
        }, 'create streaming campaign');

        if (!result) throw new Error('Failed to create campaign');
        return result;
    }, [writeContract, publicClient, handleContractCall, address, userAddress, ensureAllowance]);

    // when a user stakes we also award them viewer points so they climb the leaderboard
    // the hook now returns an object with the transaction hash and how many points were
    // applied (useful for showing a toast/alert in the UI)
    const stake = useCallback(async (amount: string): Promise<{ hash?: string; pointsAwarded?: number } | undefined> => {
        setStakingPhase('approving');
        try {
            // first perform the on‑chain operation via the helper wrapper
            const hash = await handleContractCall(async () => {
                if (!writeContract || !userAddress) throw new Error('Wallet not connected');
                const amountWei = parseUnits(amount, 18);
                await ensureAllowance(GOODDOLLAR_ADDRESS, userAddress, address as `0x${string}`, amountWei);

                setStakingPhase('staking');
                const h = await writeContract({
                    account: userAddress as `0x${string}`,
                    address: address as `0x${string}`,
                    abi: sovAdsStreamingAbi,
                    functionName: 'stake',
                    chainId,
                    args: [amountWei],
                });
                if (publicClient) await publicClient.waitForTransactionReceipt({ hash: h });
                return h;
            }, 'stake G$');

            let pointsToAward: number | undefined;
            // only try to award points if staking succeeded and we have an address
            if (hash && userAddress) {
                pointsToAward = 5;
                try {
                    const lb = await fetch('/api/viewers/leaderboard');
                    if (lb.ok) {
                        const data = await lb.json();
                        const entries: Array<{ points: number }> = data.entries || [];
                        if (entries.length) {
                            const top = entries[0].points;
                            const bottom = entries[entries.length - 1]?.points || 0;
                            const range = top - bottom;
                            const tenPct = Math.floor(range * 0.1);
                            if (tenPct > pointsToAward) {
                                pointsToAward = tenPct;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('could not fetch leaderboard for bonus calculation', e);
                }

                try {
                    await fetch('/api/viewers/points', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            wallet: userAddress.toLowerCase(),
                            type: 'STAKE',
                            campaignId: '0',
                            adId: '0',
                            siteId: 'staking',
                            points: pointsToAward,
                        }),
                    });
                } catch (e) {
                    console.warn('failed to award stake points', e);
                }
            }

            return { hash, pointsAwarded: pointsToAward };
        } finally {
            setStakingPhase('idle');
        }
    }, [writeContract, publicClient, handleContractCall, address, userAddress, ensureAllowance]);

    const unstake = useCallback(async (amount: string) => {
        return handleContractCall(async () => {
            if (!writeContract || !userAddress) throw new Error('Wallet not connected');
            const amountWei = parseUnits(amount, 18);

            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'unstake',
                chainId,
                args: [amountWei],
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'unstake G$');
    }, [writeContract, publicClient, handleContractCall, address, userAddress]);

    const updateStakingMultiplier = useCallback(async () => {
        return handleContractCall(async () => {
            if (!writeContract) throw new Error('Wallet not connected');
            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'updateStakingMultiplier',
                chainId,
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'update staking multiplier');
    }, [writeContract, publicClient, handleContractCall, address]);

    const stopCampaign = useCallback(async (campaignId: number) => {
        return handleContractCall(async () => {
            if (!writeContract) throw new Error('Wallet not connected');
            const hash = await writeContract({
                address: address as `0x${string}`,
                abi: sovAdsStreamingAbi,
                functionName: 'stopCampaign',
                chainId,
                args: [BigInt(campaignId)],
            });
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            return hash;
        }, 'stop campaign');
    }, [writeContract, publicClient, handleContractCall, address]);

    return {
        campaignCount: campaignCount as bigint | undefined,
        totalStaked: totalStaked as bigint | undefined,
        isProtocolPaused: isProtocolPaused as boolean | undefined,
        isLoading,
        stakingPhase,
        error,
        getCampaign,
        getStakerInfo,
        createStreamingCampaign,
        stake,
        unstake,
        updateStakingMultiplier,
        stopCampaign,
        pause,
        unpause,
        updatePublisherUnits
    };
};
