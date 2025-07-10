import { Address, Cell, Dictionary } from '@ton/core';

// Opcodes for your contract's operations
export const Opcodes = {
    setTaskDetails: 0x7b21c2e9,
    depositFunds: 0x4aa33259,
    verifyTaskCompletion: 0x3af5a6a4,
    submitProof: 0x6e313271,
    raiseDispute: 0x8a7c2cd3,
    resolveDispute: 0x9f1a0e5b,
    cancelTaskAndRefund: 0xc4e57873,
    withdrawFee: 0x21a039d1,
    expireTask: 0x5b394b9b,
};

// States for the task lifecycle
export enum EscrowState {
    Idle,
    TaskSetAndFundsPending,
    Active,
    PendingVerification,
    Disputed,
    Settled,
    Expired,
    Refunded,
}

// The main data structure for your contract's storage
export type EscrowSMData = {
    ziverTreasuryAddress: Address;
    tasks: Dictionary<bigint, Cell>;
    accumulatedFees: bigint;
};

// The structure for the details of a single task
export type TaskDetails = {
    taskPosterAddress: Address;
    paymentPerPerformerAmount: bigint;
    numberOfPerformersNeeded: bigint;
    performersCompleted: Dictionary<bigint, Cell>;
    completedPerformersCount: bigint;
    taskDescriptionHash: bigint;
    taskGoalHash: bigint;
    expiryTimestamp: bigint;
    totalEscrowedFunds: bigint;
    ziverFeePercentage: bigint;
    moderatorAddress: Address;
    currentState: number;
    proofSubmissionMap: Dictionary<bigint, Cell>;
    lastQueryId: bigint;
};
