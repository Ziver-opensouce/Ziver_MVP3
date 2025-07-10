import { Address, Cell, Dictionary } from '@ton/core';

export const Opcodes = {
    setTaskDetails: 0x1a2b3c4d,
    depositFunds: 0x5e6f7a8b,
    verifyTaskCompletion: 0x9c0d1e2f,
    submitProof: 0x3a4b5c6d,
    raiseDispute: 0x7e8f9a0b,
    resolveDispute: 0x11223344,
    cancelTaskAndRefund: 0x99aabbcc,
    withdrawFee: 0xddccbbaa,
    expireTask: 0xaabbccdd,
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
