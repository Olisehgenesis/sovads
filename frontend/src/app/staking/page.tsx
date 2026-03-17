'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance, usePublicClient, useWriteContract } from 'wagmi';
import { formatEther, formatUnits, maxUint256, parseUnits } from 'viem';
import { useStreamingAds } from '@/hooks/useStreamingAds';
import { CELO_MAINNET_CHAIN_ID, GOODDOLLAR_ADDRESS } from '@/lib/chain-config';
import WalletButton from '@/components/WalletButton';
import type { StakingPhase } from '@/hooks/useStreamingAds';

// ─── Types ───────────────────────────────────────────────────────────────────

type ModalMode = 'stake' | 'unstake' | 'swap' | null;
type SwapOption = {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
};

type SwapQuote = {
    amountOut: bigint;
    routeSymbols: string[];
    routeAddresses: `0x${string}`[];
    feeTiers: number[];
};

const isMockLikeSymbol = (symbol: string) => /^mock/i.test(symbol.trim());

const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const;
const CELO_TOKEN_ADDRESS = '0x471EcE3750Da237f93B8E339c536989b8978a438' as const;
const UNISWAP_QUOTER_V2 = '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8' as const;
const UNISWAP_SWAP_ROUTER_02 = '0x5615CDAb10dc425a742d643d949a7F474C01abc4' as const;
const UNISWAP_FEE_TIERS = [500, 3000, 10000] as const;

const BASE_SWAP_TOKENS: SwapOption[] = [
    { symbol: 'G$', address: GOODDOLLAR_ADDRESS as `0x${string}`, decimals: 18 },
    { symbol: 'cUSD', address: CUSD_ADDRESS as `0x${string}`, decimals: 18 },
    { symbol: 'CELO', address: CELO_TOKEN_ADDRESS as `0x${string}`, decimals: 18 },
].filter((t) => !isMockLikeSymbol(t.symbol));

const ERC20_METADATA_ABI = [
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint8' }],
    },
    {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }],
    },
] as const;

const ERC20_ALLOWANCE_ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ type: 'bool' }],
    },
] as const;

const UNISWAP_QUOTER_V2_ABI = [
    {
        name: 'quoteExactInputSingle',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96After', type: 'uint160' },
            { name: 'initializedTicksCrossed', type: 'uint32' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
    },
    {
        name: 'quoteExactInput',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'path', type: 'bytes' },
            { name: 'amountIn', type: 'uint256' },
        ],
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
            { name: 'initializedTicksCrossedList', type: 'uint32[]' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
    },
] as const;

const UNISWAP_SWAP_ROUTER_02_ABI = [
    {
        name: 'exactInputSingle',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
    {
        name: 'exactInput',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                ],
            },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
] as const;

interface StatRow {
    label: string;
    value: string;
    sub?: string;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function StakeModal({
    mode,
    onClose,
    onConfirm,
    isLoading,
    walletBalance,
    walletSymbol,
    error,
    stakingPhase,
}: {
    mode: ModalMode;
    onClose: () => void;
    onConfirm: (amount: string) => Promise<void>;
    isLoading: boolean;
    walletBalance?: string;
    walletSymbol?: string;
    error?: string | null;
    stakingPhase?: StakingPhase;
}) {
    const [amount, setAmount] = useState('');

    const isStake = mode === 'stake';
    const accentClass = isStake ? 'bg-yellow-400' : 'bg-pink-400';
    const accentText = isStake ? 'text-black' : 'text-white';
    const label = isStake ? 'Stake' : 'Unstake';
    const loadingLabel = isStake
        ? stakingPhase === 'approving'
            ? 'Approving G$...'
            : stakingPhase === 'staking'
                ? 'Staking G$...'
                : 'Processing...'
        : 'Processing...';

    const handleConfirm = async () => {
        if (!amount || isNaN(Number(amount))) return;
        await onConfirm(amount);
        setAmount('');
    };

    const setMax = () => {
        if (walletBalance) setAmount(walletBalance);
    };

    // Close on backdrop click
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
            onClick={handleBackdrop}
        >
            <div className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-md font-mono animate-in fade-in zoom-in-95 duration-150">
                {/* Header bar */}
                <div className={`${accentClass} ${accentText} px-6 py-4 flex items-center justify-between border-b-4 border-black`}>
                    <h2 className="text-xl font-black uppercase tracking-tighter">{label} G$</h2>
                    <button
                        onClick={onClose}
                        className="font-black text-xl leading-none hover:opacity-70 transition-opacity"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Amount input */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-black uppercase tracking-widest">Amount (G$)</label>
                            {walletBalance && (
                                <button
                                    onClick={setMax}
                                    className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5 hover:bg-gray-800 transition-colors"
                                >
                                    Max: {Number(walletBalance).toFixed(2)} {walletSymbol}
                                </button>
                            )}
                        </div>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            autoFocus
                            className="w-full bg-gray-50 border-2 border-black p-3 text-2xl font-black focus:outline-none focus:bg-yellow-50 transition-colors"
                        />
                    </div>

                    {/* Rules */}
                    {isStake ? (
                        <div className="bg-yellow-50 border-2 border-yellow-400 p-3 space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700 mb-1">What happens when you stake:</p>
                            <ul className="text-xs font-bold text-black/70 list-disc pl-4 space-y-1">
                                <li>Rewards stream to you instantly via Superfluid</li>
                                <li>Time-boost multiplier starts accruing</li>
                                <li>SovPoints earned for leaderboard (+5 pts / 10% range)</li>
                            </ul>
                        </div>
                    ) : (
                        <div className="bg-pink-50 border-2 border-pink-400 p-3 space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-pink-700 mb-1">⚠ Warning:</p>
                            <ul className="text-xs font-bold text-black/70 list-disc pl-4 space-y-1">
                                <li>Unstaking resets your time-accrued multiplier to 1.0x</li>
                                <li>Reward stream stops for the withdrawn amount</li>
                            </ul>
                        </div>
                    )}

                    {error && (
                        <p className="text-xs font-bold text-red-600 bg-red-50 border-2 border-red-500 p-2 uppercase">
                            {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 font-black uppercase text-sm border-2 border-black bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading || !amount || Number(amount) <= 0}
                            className={`flex-1 py-3 font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${accentClass} ${accentText}`}
                        >
                            {isLoading ? loadingLabel : `Confirm ${label}`}
                        </button>
                    </div>
                    {isStake && isLoading && (
                        <p className="text-[10px] font-black uppercase text-black/60">
                            Step 1/2 approve, step 2/2 stake.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function SwapModal({
    onClose,
    onSwap,
    onQuote,
    getTokenBalance,
    swapOptions,
    isLoading,
    error,
    success,
    gDollarBalance,
    celoBalance,
    cusdBalance,
    chainId,
}: {
    onClose: () => void;
    onSwap: (amount: string, fromTokenAddress: `0x${string}`, toTokenAddress: `0x${string}`, autoStake: boolean) => Promise<void>;
    onQuote: (amount: string, fromTokenAddress: `0x${string}`, toTokenAddress: `0x${string}`) => Promise<string | null>;
    getTokenBalance: (tokenAddress: `0x${string}`) => Promise<string>;
    swapOptions: SwapOption[];
    isLoading: boolean;
    error?: string | null;
    success?: string | null;
    gDollarBalance?: string;
    celoBalance?: string;
    cusdBalance?: string;
    chainId?: number;
}) {
    const [amount, setAmount] = useState('');
    const [fromTokenAddress, setFromTokenAddress] = useState<`0x${string}`>(GOODDOLLAR_ADDRESS as `0x${string}`);
    const [toTokenAddress, setToTokenAddress] = useState<`0x${string}`>(CUSD_ADDRESS);
    const [autoStake, setAutoStake] = useState(false);
    const [fromBalance, setFromBalance] = useState<string>('0');
    const [quotePreview, setQuotePreview] = useState<string | null>(null);
    const [isQuoting, setIsQuoting] = useState(false);

    const fromToken = swapOptions.find((t) => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
    const toToken = swapOptions.find((t) => t.address.toLowerCase() === toTokenAddress.toLowerCase());
    const toTokenChoices = swapOptions.filter((t) => t.address.toLowerCase() !== fromTokenAddress.toLowerCase());

    useEffect(() => {
        if (!swapOptions.length) return;

        const hasFrom = swapOptions.some((t) => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
        if (!hasFrom) {
            setFromTokenAddress(swapOptions[0].address);
            return;
        }

        const hasTo = swapOptions.some((t) => t.address.toLowerCase() === toTokenAddress.toLowerCase());
        if (!hasTo) {
            const fallbackTo = swapOptions.find((t) => t.address.toLowerCase() !== fromTokenAddress.toLowerCase());
            if (fallbackTo) setToTokenAddress(fallbackTo.address);
        }
    }, [fromTokenAddress, toTokenAddress, swapOptions]);

    useEffect(() => {
        if (!toTokenChoices.find((t) => t.address.toLowerCase() === toTokenAddress.toLowerCase())) {
            setToTokenAddress(toTokenChoices[0]?.address || (CUSD_ADDRESS as `0x${string}`));
        }
    }, [toTokenAddress, toTokenChoices]);

    useEffect(() => {
        let mounted = true;

        const pickBestDefaults = async () => {
            if (!swapOptions.length) return;

            const balances = await Promise.all(
                swapOptions.map(async (token) => {
                    try {
                        const bal = await getTokenBalance(token.address);
                        return { token, value: Number(bal || '0') };
                    } catch {
                        return { token, value: 0 };
                    }
                })
            );

            const bestFrom = balances
                .filter((b) => Number.isFinite(b.value) && b.value > 0)
                .sort((a, b) => b.value - a.value)[0]?.token;

            if (!mounted || !bestFrom) return;

            setFromTokenAddress((current) => {
                const currentValue = balances.find((b) => b.token.address.toLowerCase() === current.toLowerCase())?.value ?? 0;
                if (currentValue > 0) return current;
                return bestFrom.address;
            });
        };

        void pickBestDefaults();

        return () => {
            mounted = false;
        };
    }, [getTokenBalance, swapOptions]);

    useEffect(() => {
        if (!(fromToken?.symbol !== 'G$' && toToken?.symbol === 'G$')) {
            setAutoStake(false);
        }
    }, [fromToken?.symbol, toToken?.symbol]);

    useEffect(() => {
        let mounted = true;
        getTokenBalance(fromTokenAddress)
            .then((bal) => {
                if (mounted) setFromBalance(bal);
            })
            .catch(() => {
                if (mounted) setFromBalance('0');
            });
        return () => {
            mounted = false;
        };
    }, [fromTokenAddress, getTokenBalance]);

    useEffect(() => {
        let mounted = true;
        const timeout = setTimeout(async () => {
            if (!amount || Number(amount) <= 0) {
                if (mounted) setQuotePreview(null);
                return;
            }

            setIsQuoting(true);
            try {
                const preview = await onQuote(amount, fromTokenAddress, toTokenAddress);
                if (mounted) setQuotePreview(preview);
            } catch {
                if (mounted) setQuotePreview(null);
            } finally {
                if (mounted) setIsQuoting(false);
            }
        }, 350);

        return () => {
            mounted = false;
            clearTimeout(timeout);
        };
    }, [amount, fromTokenAddress, onQuote, toTokenAddress]);

    const handleSetMax = () => {
        setAmount(fromBalance);
    };

    const handleSweep = async () => {
        if (!fromBalance || Number(fromBalance) <= 0) return;
        await onSwap(fromBalance, fromTokenAddress, toTokenAddress, autoStake);
    };

    const handleSwap = async () => {
        if (!amount || Number(amount) <= 0) return;
        await onSwap(amount, fromTokenAddress, toTokenAddress, autoStake);
    };

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
            onClick={handleBackdrop}
        >
            <div className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-md font-mono animate-in fade-in zoom-in-95 duration-150">
                <div className="bg-cyan-400 text-black px-6 py-4 flex items-center justify-between border-b-4 border-black">
                    <h2 className="text-xl font-black uppercase tracking-tighter">Swap G$</h2>
                    <button
                        onClick={onClose}
                        className="font-black text-xl leading-none hover:opacity-70 transition-opacity"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {chainId !== CELO_MAINNET_CHAIN_ID && (
                        <p className="text-xs font-bold text-red-600 bg-red-50 border-2 border-red-500 p-2 uppercase">
                            Switch to Celo mainnet to swap.
                        </p>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-[10px] font-black uppercase">
                        <div className="border-2 border-black p-2 bg-yellow-100">G$: {Number(gDollarBalance || '0').toFixed(2)}</div>
                        <div className="border-2 border-black p-2 bg-emerald-100">cUSD: {Number(cusdBalance || '0').toFixed(2)}</div>
                        <div className="border-2 border-black p-2 bg-indigo-100">CELO: {Number(celoBalance || '0').toFixed(2)}</div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-widest">Amount ({fromToken?.symbol || 'Token'})</label>
                            <button
                                onClick={handleSetMax}
                                className="text-[10px] font-black uppercase border-2 border-black px-2 py-0.5 bg-white hover:bg-gray-100"
                                type="button"
                            >
                                Max: {Number(fromBalance || '0').toFixed(4)}
                            </button>
                        </div>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="mt-1 w-full bg-gray-50 border-2 border-black p-3 text-2xl font-black focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-black uppercase tracking-widest">From</label>
                        <select
                            value={fromTokenAddress}
                            onChange={(e) => setFromTokenAddress(e.target.value as `0x${string}`)}
                            className="mt-1 w-full bg-white border-2 border-black p-3 text-sm font-black uppercase focus:outline-none"
                        >
                            {swapOptions.map((token) => (
                                <option key={token.address} value={token.address}>{token.symbol}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-black uppercase tracking-widest">To</label>
                        <select
                            value={toTokenAddress}
                            onChange={(e) => setToTokenAddress(e.target.value as `0x${string}`)}
                            className="mt-1 w-full bg-white border-2 border-black p-3 text-sm font-black uppercase focus:outline-none"
                        >
                            {toTokenChoices.map((token) => (
                                <option key={token.address} value={token.address}>{token.symbol}</option>
                            ))}
                        </select>
                    </div>

                    {fromToken?.symbol !== 'G$' && toToken?.symbol === 'G$' && toToken?.address.toLowerCase() === GOODDOLLAR_ADDRESS.toLowerCase() && (
                        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider border-2 border-black p-2 bg-yellow-100">
                            <input
                                type="checkbox"
                                checked={autoStake}
                                onChange={(e) => setAutoStake(e.target.checked)}
                            />
                            Stake swapped G$ immediately
                        </label>
                    )}

                    {success && (
                        <p className="text-xs font-bold text-green-700 bg-green-50 border-2 border-green-500 p-2">
                            {success}
                        </p>
                    )}

                    {error && (
                        <p className="text-xs font-bold text-red-600 bg-red-50 border-2 border-red-500 p-2 uppercase">
                            {error}
                        </p>
                    )}

                    {isQuoting && (
                        <p className="text-xs font-bold text-black/60 bg-gray-100 border-2 border-black p-2 uppercase">
                            Quoting...
                        </p>
                    )}

                    {quotePreview && !error && (
                        <p className="text-xs font-bold text-cyan-800 bg-cyan-50 border-2 border-cyan-500 p-2">
                            {quotePreview}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 font-black uppercase text-sm border-2 border-black bg-white hover:bg-gray-100 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSwap}
                            disabled={isLoading || !amount || Number(amount) <= 0 || chainId !== CELO_MAINNET_CHAIN_ID}
                            className="flex-1 py-3 font-black uppercase text-sm border-2 border-black bg-cyan-400 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Swapping...' : `Swap ${fromToken?.symbol || ''} to ${toToken?.symbol || ''}`}
                        </button>
                    </div>

                    <button
                        onClick={handleSweep}
                        disabled={isLoading || Number(fromBalance || '0') <= 0 || chainId !== CELO_MAINNET_CHAIN_ID}
                        className="w-full py-2 font-black uppercase text-xs border-2 border-black bg-yellow-300 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Processing...' : `Sweep max ${fromToken?.symbol || 'token'} to ${toToken?.symbol || 'token'}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <div className={`border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${accent ?? 'bg-white'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
            <p className="text-2xl font-black leading-none">{value}</p>
            {sub && <p className="text-[10px] font-bold uppercase opacity-50 mt-1">{sub}</p>}
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StakingPage() {
    const { address, chainId } = useAccount();
    const publicClient = usePublicClient({ chainId: CELO_MAINNET_CHAIN_ID });
    const { writeContractAsync } = useWriteContract();
    const {
        stake,
        unstake,
        getStakerInfo,
        updateStakingMultiplier,
        totalStaked,
        isLoading,
        stakingPhase,
        error,
    } = useStreamingAds();

    const [stakedAmount, setStakedAmount] = useState('0');
    const [multiplier, setMultiplier] = useState('1.0');
    const [stakingTime, setStakingTime] = useState('—');
    const [units, setUnits] = useState('0');
    const [modal, setModal] = useState<ModalMode>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [swapError, setSwapError] = useState<string | null>(null);
    const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
    const [isSwapping, setIsSwapping] = useState(false);
    const [swapOptions, setSwapOptions] = useState<SwapOption[]>(BASE_SWAP_TOKENS);

    const { data: balanceData } = useBalance({
        address: address as `0x${string}`,
        token: GOODDOLLAR_ADDRESS as `0x${string}`,
    });

    const { data: celoBalance } = useBalance({
        address: address as `0x${string}`,
    });

    const { data: cUsdBalance } = useBalance({
        address: address as `0x${string}`,
        token: CUSD_ADDRESS,
    });

    const loadSwapOptions = useCallback(async () => {
        if (chainId !== CELO_MAINNET_CHAIN_ID) return;
        setSwapOptions(BASE_SWAP_TOKENS);
    }, [chainId]);

    useEffect(() => {
        void loadSwapOptions();
    }, [loadSwapOptions]);

    const encodeV3Path = useCallback((tokens: `0x${string}`[], fees: number[]): `0x${string}` => {
        if (tokens.length < 2 || fees.length !== tokens.length - 1) {
            throw new Error('Invalid V3 path');
        }

        let out = '0x';
        for (let i = 0; i < tokens.length; i++) {
            out += tokens[i].slice(2).toLowerCase();
            if (i < fees.length) {
                out += fees[i].toString(16).padStart(6, '0');
            }
        }
        return out as `0x${string}`;
    }, []);

    const quoteBestUniswapRoute = useCallback(async (
        tokenIn: `0x${string}`,
        tokenOut: `0x${string}`,
        amountIn: bigint,
    ): Promise<SwapQuote> => {
        if (!publicClient) throw new Error('Public client not ready');

        let best: SwapQuote | null = null;

        for (const fee of UNISWAP_FEE_TIERS) {
            try {
                const result = await publicClient.readContract({
                    address: UNISWAP_QUOTER_V2,
                    abi: UNISWAP_QUOTER_V2_ABI,
                    functionName: 'quoteExactInputSingle',
                    args: [
                        {
                            tokenIn,
                            tokenOut,
                            amountIn,
                            fee,
                            sqrtPriceLimitX96: 0n,
                        },
                    ],
                });

                const quoted = result[0];
                if (quoted > 0n && (!best || quoted > best.amountOut)) {
                    best = {
                        amountOut: quoted,
                        routeSymbols: [
                            swapOptions.find((t) => t.address.toLowerCase() === tokenIn.toLowerCase())?.symbol ?? 'IN',
                            swapOptions.find((t) => t.address.toLowerCase() === tokenOut.toLowerCase())?.symbol ?? 'OUT',
                        ],
                        routeAddresses: [tokenIn, tokenOut],
                        feeTiers: [fee],
                    };
                }
            } catch {
                continue;
            }
        }

        const intermediates = swapOptions
            .map((t) => t.address)
            .filter((a) => a.toLowerCase() !== tokenIn.toLowerCase() && a.toLowerCase() !== tokenOut.toLowerCase());

        for (const mid of intermediates) {
            for (const feeA of UNISWAP_FEE_TIERS) {
                for (const feeB of UNISWAP_FEE_TIERS) {
                    try {
                        const path = encodeV3Path([tokenIn, mid, tokenOut], [feeA, feeB]);
                        const result = await publicClient.readContract({
                            address: UNISWAP_QUOTER_V2,
                            abi: UNISWAP_QUOTER_V2_ABI,
                            functionName: 'quoteExactInput',
                            args: [path, amountIn],
                        });

                        const quoted = result[0];
                        if (quoted > 0n && (!best || quoted > best.amountOut)) {
                            const inSym = swapOptions.find((t) => t.address.toLowerCase() === tokenIn.toLowerCase())?.symbol ?? 'IN';
                            const midSym = swapOptions.find((t) => t.address.toLowerCase() === mid.toLowerCase())?.symbol ?? 'MID';
                            const outSym = swapOptions.find((t) => t.address.toLowerCase() === tokenOut.toLowerCase())?.symbol ?? 'OUT';
                            best = {
                                amountOut: quoted,
                                routeSymbols: [inSym, midSym, outSym],
                                routeAddresses: [tokenIn, mid, tokenOut],
                                feeTiers: [feeA, feeB],
                            };
                        }
                    } catch {
                        continue;
                    }
                }
            }
        }

        if (!best) {
            throw new Error('Uniswap quote unavailable for this pair.');
        }

        return best;
    }, [encodeV3Path, publicClient, swapOptions]);

    const handleQuotePreview = useCallback(async (
        amount: string,
        fromTokenAddress: `0x${string}`,
        toTokenAddress: `0x${string}`,
    ): Promise<string | null> => {
        if (!publicClient) return null;
        const fromToken = swapOptions.find((t) => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
        const toToken = swapOptions.find((t) => t.address.toLowerCase() === toTokenAddress.toLowerCase());
        if (!fromToken || !toToken) return null;
        if (!amount || Number(amount) <= 0) return null;

        try {
            const amountIn = parseUnits(amount, fromToken.decimals);
            const quote = await quoteBestUniswapRoute(fromToken.address, toToken.address, amountIn);
            const approxOut = Number(formatUnits(quote.amountOut, toToken.decimals)).toFixed(4);
            const feeLabel = quote.feeTiers.map((f) => `${f / 10000}%`).join(' -> ');
            return `Approx: ${approxOut} ${toToken.symbol} via ${quote.routeSymbols.join(' -> ')} (${feeLabel})`;
        } catch {
            return null;
        }
    }, [publicClient, quoteBestUniswapRoute, swapOptions]);

    const handleSwap = useCallback(async (amount: string, fromTokenAddress: `0x${string}`, toTokenAddress: `0x${string}`, autoStake: boolean) => {
        if (!address || !publicClient || !writeContractAsync) return;
        if (chainId !== CELO_MAINNET_CHAIN_ID) {
            setSwapError('Switch to Celo mainnet to continue.');
            return;
        }

        setIsSwapping(true);
        setSwapError(null);
        setSwapSuccess(null);

        try {
            if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
                throw new Error('Choose different from/to tokens');
            }

            const fromToken = swapOptions.find((t) => t.address.toLowerCase() === fromTokenAddress.toLowerCase());
            const toToken = swapOptions.find((t) => t.address.toLowerCase() === toTokenAddress.toLowerCase());

            if (!fromToken || !toToken) {
                throw new Error('Unsupported token selection');
            }

            const amountIn = parseUnits(amount, fromToken.decimals);
            const routerAllowance = await publicClient.readContract({
                address: fromToken.address,
                abi: ERC20_ALLOWANCE_ABI,
                functionName: 'allowance',
                args: [address as `0x${string}`, UNISWAP_SWAP_ROUTER_02],
            });

            if (routerAllowance < amountIn) {
                const approveHash = await writeContractAsync({
                    chainId: CELO_MAINNET_CHAIN_ID,
                    address: fromToken.address,
                    abi: ERC20_ALLOWANCE_ABI,
                    functionName: 'approve',
                    args: [UNISWAP_SWAP_ROUTER_02, maxUint256],
                });
                await publicClient.waitForTransactionReceipt({ hash: approveHash });
            }

            const quote = await quoteBestUniswapRoute(fromToken.address, toToken.address, amountIn);
            const minOut = (quote.amountOut * 9900n) / 10000n;

            const routeAddresses = quote.routeAddresses;

            let txHashForMessage: `0x${string}`;
            if (routeAddresses.length === 3 && quote.feeTiers.length === 2) {
                const path = encodeV3Path(routeAddresses, quote.feeTiers);
                txHashForMessage = await writeContractAsync({
                    chainId: CELO_MAINNET_CHAIN_ID,
                    address: UNISWAP_SWAP_ROUTER_02,
                    abi: UNISWAP_SWAP_ROUTER_02_ABI,
                    functionName: 'exactInput',
                    args: [
                        {
                            path,
                            recipient: address as `0x${string}`,
                            amountIn,
                            amountOutMinimum: minOut,
                        },
                    ],
                });
            } else {
                txHashForMessage = await writeContractAsync({
                    chainId: CELO_MAINNET_CHAIN_ID,
                    address: UNISWAP_SWAP_ROUTER_02,
                    abi: UNISWAP_SWAP_ROUTER_02_ABI,
                    functionName: 'exactInputSingle',
                    args: [
                        {
                            tokenIn: fromToken.address,
                            tokenOut: toToken.address,
                            fee: quote.feeTiers[0],
                            recipient: address as `0x${string}`,
                            amountIn,
                            amountOutMinimum: minOut,
                            sqrtPriceLimitX96: 0n,
                        },
                    ],
                });
            }
            await publicClient.waitForTransactionReceipt({ hash: txHashForMessage });

            const receivedLabel = Number(formatUnits(quote.amountOut, toToken.decimals)).toFixed(4);
            const routeLabel = quote.routeSymbols.join(' -> ');
            const feeLabel = quote.feeTiers.map((f) => `${f / 10000}%`).join(' -> ');

            if (autoStake && toToken.symbol === 'G$') {
                const stakeAmount = formatUnits(quote.amountOut, 18);
                await stake(stakeAmount);
                setSwapSuccess(`Swap + stake complete via Uniswap (${routeLabel}, fees ${feeLabel}). Est. ${receivedLabel} ${toToken.symbol}. Tx: ${txHashForMessage}`);
            } else {
                setSwapSuccess(`Swap complete via Uniswap (${routeLabel}, fees ${feeLabel}). Est. ${receivedLabel} ${toToken.symbol}. Tx: ${txHashForMessage}`);
            }

            setModal(null);

        } catch (e) {
            setSwapError(e instanceof Error ? e.message : 'Swap failed');
        } finally {
            setIsSwapping(false);
        }
    }, [address, chainId, encodeV3Path, publicClient, quoteBestUniswapRoute, stake, swapOptions, writeContractAsync]);

    const getTokenBalance = useCallback(async (tokenAddress: `0x${string}`): Promise<string> => {
        if (!address || !publicClient) return '0';

        if (tokenAddress.toLowerCase() === CELO_TOKEN_ADDRESS.toLowerCase()) {
            const bal = await publicClient.getBalance({ address: address as `0x${string}` });
            return formatUnits(bal, 18);
        }

        const bal = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ALLOWANCE_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
        });

        const option = swapOptions.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
        return formatUnits(bal, option?.decimals ?? 18);
    }, [address, publicClient, swapOptions]);

    const fetchStakerData = useCallback(async () => {
        if (!address) return;
        const info = await getStakerInfo(address);
        if (!info) return;
        const stakedEther = formatEther(info.stakedAmount);
        setStakedAmount(stakedEther);
        setUnits(info.units.toString());

        // stakingTime is a unix timestamp (seconds) of when staking began — compute elapsed
        const startTs = Number(info.stakingTime);
        if (startTs === 0) {
            setStakingTime('—');
        } else {
            const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - startTs);
            const days = Math.floor(elapsed / 86400);
            const hrs = Math.floor((elapsed % 86400) / 3600);
            const mins = Math.floor((elapsed % 3600) / 60);
            setStakingTime(elapsed < 3600 ? `${mins}m` : elapsed < 86400 ? `${hrs}h ${mins}m` : `${days}d ${hrs}h`);
        }

        // Multiplier: units-per-G$ staked. Divide by ether value to avoid BigInt→Number overflow.
        const stakedNum = Number(stakedEther);
        setMultiplier(
            stakedNum > 0
                ? (Number(info.units) / stakedNum).toFixed(2)
                : '1.00'
        );
    }, [address, getStakerInfo]);

    useEffect(() => {
        fetchStakerData();
        const t = setInterval(fetchStakerData, 10_000);
        return () => clearInterval(t);
    }, [fetchStakerData]);

    const handleAction = async (amount: string) => {
        if (modal === 'stake') {
            const result = await stake(amount);
            if (result?.pointsAwarded) {
                setToast(`+${result.pointsAwarded.toLocaleString()} SovPoints earned 🔥`);
                setTimeout(() => setToast(null), 5000);
            }
        } else {
            await unstake(amount);
        }
        setModal(null);
        fetchStakerData();
    };

    // ── Not connected ──────────────────────────────────────────────────────────
    if (!address) {
        return (
            <div className="min-h-screen bg-[#F0F0F0] font-mono flex items-center justify-center p-4">
                <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-10 text-center max-w-sm w-full">
                    <div className="text-5xl mb-5">⚡</div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Stake G$</h2>
                    <p className="text-xs font-bold text-black/50 uppercase mb-6">
                        Connect your wallet to stake and earn streaming rewards.
                    </p>
                    <WalletButton />
                </div>
            </div>
        );
    }

    // ── Table rows ─────────────────────────────────────────────────────────────
    const tableRows: StatRow[] = [
        { label: 'Active Stake', value: `${Number(stakedAmount).toLocaleString()} G$` },
        { label: 'Units Earned', value: Number(units).toLocaleString(), sub: 'proportional reward weight' },
        { label: 'Time Staked', value: stakingTime },
        { label: 'Your Multiplier', value: `${multiplier}x`, sub: 'time-boost factor' },
        { label: 'Wallet Balance', value: balanceData ? `${Number(balanceData.formatted).toFixed(2)} ${balanceData.symbol}` : '—' },
        { label: 'Global TVL', value: totalStaked ? `${Number(formatEther(totalStaked)).toLocaleString()} G$` : '0 G$' },
    ];

    return (
        <>
            {/* Modal */}
            {modal && (
                modal === 'swap' ? (
                    <SwapModal
                        onClose={() => setModal(null)}
                        onSwap={handleSwap}
                        onQuote={handleQuotePreview}
                        getTokenBalance={getTokenBalance}
                        swapOptions={swapOptions}
                        isLoading={isSwapping}
                        error={swapError}
                        success={swapSuccess}
                        gDollarBalance={balanceData?.formatted}
                        celoBalance={celoBalance?.formatted}
                        cusdBalance={cUsdBalance?.formatted}
                        chainId={chainId}
                    />
                ) : (
                    <StakeModal
                        mode={modal}
                        onClose={() => setModal(null)}
                        onConfirm={handleAction}
                        isLoading={isLoading}
                        walletBalance={balanceData?.formatted}
                        walletSymbol={balanceData?.symbol}
                        error={error}
                        stakingPhase={stakingPhase}
                    />
                )
            )}

            <div className="min-h-screen bg-[#F0F0F0] font-mono selection:bg-yellow-300">
                <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">

                    {/* ── Page header ── */}
                    <div>
                        <h1 className="text-5xl font-black uppercase tracking-tighter leading-none border-b-8 border-black pb-3 mb-3">
                            Staking <span className="text-yellow-500">Pulse</span>
                        </h1>
                        <p className="text-base font-bold italic text-black/60">
                            Secure the network · Boost your rewards · Fuel the flow
                        </p>
                        {toast && (
                            <div className="mt-3 px-4 py-3 bg-green-100 border-2 border-green-600 text-green-800 text-sm font-black uppercase">
                                {toast}
                            </div>
                        )}
                    </div>

                    {/* ── Hero stat cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <StatCard label="Your Multiplier" value={`${multiplier}x`} sub="time-boost" accent="bg-yellow-400" />
                        <StatCard label="Active Stake" value={`${Number(stakedAmount).toFixed(2)} G$`} accent="bg-black text-white [&_p]:text-white" />
                        <StatCard label="Global TVL" value={totalStaked ? `${Number(formatEther(totalStaked)).toLocaleString()} G$` : '0 G$'} />
                    </div>

                    {/* ── CTA buttons ── */}
                    <div className="flex gap-4">
                        <button
                            onClick={() => setModal('stake')}
                            className="flex-1 py-4 bg-yellow-400 text-black font-black uppercase text-lg tracking-widest border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                        >
                            ↑ Stake
                        </button>
                        <button
                            onClick={() => setModal('unstake')}
                            className="flex-1 py-4 bg-white text-black font-black uppercase text-lg tracking-widest border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                        >
                            ↓ Unstake
                        </button>
                        <button
                            onClick={() => setModal('swap')}
                            className="px-4 py-4 bg-cyan-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all font-black text-xl"
                            title="Swap G$ to cUSD or CELO"
                        >
                            ⇄
                        </button>
                        <button
                            onClick={() => updateStakingMultiplier()}
                            disabled={isLoading}
                            title="Sync your time-boost multiplier on-chain"
                            className="px-4 py-4 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all font-black text-xl disabled:opacity-40"
                        >
                            ⟳
                        </button>
                    </div>

                    {/* ── Stats table ── */}
                    <div>
                        <h2 className="text-xs font-black uppercase tracking-widest mb-3 border-b-2 border-black pb-1">
                            Your Position
                        </h2>
                        <table className="w-full border-2 border-black text-sm">
                            <tbody>
                                {tableRows.map((row, i) => (
                                    <tr
                                        key={row.label}
                                        className={`border-b border-black last:border-b-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                    >
                                        <td className="px-4 py-3 font-black uppercase text-xs text-black/60 tracking-wider w-1/2 border-r border-black">
                                            {row.label}
                                            {row.sub && <span className="block text-[9px] font-bold normal-case text-black/40 mt-0.5">{row.sub}</span>}
                                        </td>
                                        <td className="px-4 py-3 font-black text-right">
                                            {row.value}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Info grid ── */}
                    <div>
                        <h2 className="text-xs font-black uppercase tracking-widest mb-3 border-b-2 border-black pb-1">
                            How It Works
                        </h2>
                        <div className="grid sm:grid-cols-3 gap-4">
                            {[
                                {
                                    n: '01', bg: 'bg-black text-white', title: 'Instant Flow',
                                    body: 'Rewards stream via Superfluid GDA — no claiming needed. Check your Superfluid dashboard.',
                                },
                                {
                                    n: '02', bg: 'bg-yellow-400', title: 'Time Boost',
                                    body: 'Your reward share grows the longer you stay staked without adding more capital.',
                                },
                                {
                                    n: '03', bg: 'bg-pink-400 text-white', title: 'Zero Lock',
                                    body: 'Unstake anytime. Capital is always liquid — but your multiplier is built by staying.',
                                },
                            ].map(({ n, bg, title, body }) => (
                                <div key={n} className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <div className={`w-9 h-9 flex items-center justify-center font-black text-sm border-2 border-black mb-3 ${bg}`}>{n}</div>
                                    <h4 className="font-black uppercase text-sm mb-1">{title}</h4>
                                    <p className="text-xs font-bold text-black/60 leading-relaxed">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </main>
            </div>
        </>
    );
}
