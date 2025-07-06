import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleReader
} from '@ton/core';

// Resolver for performerCompleted dictionary keys (Address hash to bigint)
const performerCompletedKeyResolver = {
    serialize: (src: bigint, builder: Builder) => { builder.storeUint(src, 256); },
    parse: (src: Slice) => { return src.loadUint(256); }
};

// Resolver for performerCompleted dictionary values (empty cell, or could be a boolean/status)
const performerCompletedValueResolver = {
    serialize: (src: Cell, builder: Builder) => { builder.storeRef(src); }, // Store a cell reference
    parse: (src: Slice) => { return src.loadRef(); } // Load a cell reference
};

// Resolver for proofSubmissionMap dictionary keys (Address hash to bigint)
const proofSubmissionMapKeyResolver = {
    serialize: (src: bigint, builder: Builder) => { builder.storeUint(src, 256); },
    parse: (src: Slice) => { return src.loadUint(256); }
};

// Resolver for proofSubmissionMap dictionary values (proof hash as bigint, stored in a cell)
const proofSubmissionMapValueResolver = {
    serialize: (src: Cell, builder: Builder) => { builder.storeRef(src); }, // Store a cell reference
    parse: (src: Slice) => { return src.loadRef(); } // Load a cell reference
};

// Define an Enum for your contract states for better readability
export enum EscrowState {
    Idle = 0,
    TaskSetAndFundsPending = 1,
    Active = 2,
    PendingVerification = 3,
    Settled = 4,
    Disputed = 5,
    Expired = 6,
    Refunded = 7,
}

// Define the structure for individual task details
export type TaskDetails = {
    taskId: bigint; // Unique identifier for the task. Use a secure unique ID strategy.
    taskPosterAddress: Address;
    paymentPerPerformerAmount: bigint; // In nanotoncoins
    numberOfPerformersNeeded: bigint;
    performersCompleted: Dictionary<bigint, Cell>; // Dictionary for completed performers
    completedPerformersCount: bigint; // <-- ADD THIS LINE HERE
    taskDescriptionHash: bigint; // Hash of off-chain description (e.g., SHA256 of IPFS CID)
    taskGoalHash: bigint; // Hash of off-chain goal criteria (e.g., SHA256)
    expiryTimestamp: bigint; // Unix timestamp
    totalEscrowedFunds: bigint; // Funds held for this specific task
    ziverFeePercentage: bigint; // e.g., 6 for 6% (stored as 6, actual division in FunC)
    moderatorAddress: Address; // Address authorized to verify/resolve disputes
    currentState: EscrowState; // Current state of this specific task
    proofSubmissionMap: Dictionary<bigint, Cell>; // Dictionary to store performer proof hashes
};

// Define the contract's overall data structure
export type EscrowSMData = {
    tasks: Cell; // A dictionary (HashMap) where key is taskId (bigint) and value is serialized TaskDetails (Cell)
    ziverTreasuryAddress: Address; // Ziver's main wallet for fees
};

// Define Opcodes for your contract's messages
export const Opcodes = {
    // Standard ops
    deploy: 0x61737467, // Example deploy opcode (often used internally by Blueprint, but good to define)
    
    // Escrow specific ops
    send_task_details: 0x1a2b3c4d, // Opcode for setting up a new task
    deposit_funds: 0x5e6f7a8b,     // Opcode for depositing funds for a task
    verify_task_completion: 0x9c0d1e2f, // Opcode for task poster to verify completion
    submit_proof: 0x3a4b5c6d, // Opcode for performers to submit proof of work
    raise_dispute: 0x7e8f9a0b,    // Opcode for raising a dispute
    resolve_dispute: 0x11223344, // Opcode for moderator to resolve dispute
    withdraw_funds: 0x55667788,  // Opcode for performers to withdraw funds
    cancel_task_and_refund: 0x99aabbcc, // Opcode for task poster to cancel and refund
    withdraw_fee: 0xddccbbaa, // Opcode for Ziver to withdraw fees
};


export class EscrowSM implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell; };

    // This constructor is used when creating a new contract instance in your tests/scripts
    constructor(workchain: number, initialData: EscrowSMData) {
        this.init = {
            code: new Cell(), // Blueprint will replace this with the actual compiled FunC code
            data: EscrowSM.toCell(initialData), // Serialize the initial data into a Cell
        };
        this.address = contractAddress(workchain, this.init);
    }

    // Static method to create a contract instance from an existing address (for interaction)
    static createFromAddress(address: Address) {
        return new EscrowSM(0, { tasks: new Cell(), ziverTreasuryAddress: new Address(0, Buffer.alloc(32)) }); // Placeholder initialData, as it's not needed for existing contract
    }

    // Static method to deserialize contract data from a Cell
    static fromCell(cell: Cell): EscrowSMData {
        const reader = cell.beginParse();
        const ziverTreasuryAddress = reader.loadAddress();
        const tasks = reader.loadRef(); // Load the dictionary as a cell reference
        return {
            ziverTreasuryAddress,
            tasks
        };
    }

    // Static method to serialize contract data into a Cell (for deployment or state updates)
    static toCell(data: EscrowSMData): Cell {
        return beginCell()
            .storeAddress(data.ziverTreasuryAddress)
            .storeRef(data.tasks) // Store the dictionary cell as a reference
            .endCell();
    }

    // Method to send the initial deploy message to the contract
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.deploy, 32).endCell(), // Often a simple opcode or empty body
        });
    }

    // --- Message Senders (for external interactions) ---

    // Message to set task details for a new task
    async sendSetTaskDetails(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            paymentPerPerformerAmount: bigint;
            numberOfPerformersNeeded: bigint;
            taskDescriptionHash: bigint;
            taskGoalHash: bigint;
            expiryTimestamp: bigint;
            ziverFeePercentage: bigint;
            moderatorAddress: Address;
            value: bigint; // Value to attach to the message (e.g., gas)
            queryID?: bigint;
        }
    ) {
        // Task poster's address will be `in_msg_full.src` in FunC
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.send_task_details, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64) // Assuming taskId is 64-bit
                .storeCoins(opts.paymentPerPerformerAmount)
                .storeUint(opts.numberOfPerformersNeeded, 32) // Assuming 32-bit for performer count
                .storeUint(opts.taskDescriptionHash, 256) // Assuming 256-bit hash
                .storeUint(opts.taskGoalHash, 256) // Assuming 256-bit hash
                .storeUint(opts.expiryTimestamp, 64) // Assuming 64-bit Unix timestamp
                .storeUint(opts.ziverFeePercentage, 8) // Assuming 8-bit for percentage (0-100)
                .storeAddress(opts.moderatorAddress)
                .endCell(),
        });
    }

    // Message for performers to deposit funds for their task (if applicable, e.g., if performers also escrow funds)
    // For now, assuming task poster deposits funds. This message might be removed or adjusted later.
    async sendDepositFunds(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint; // The actual funds to deposit
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deposit_funds, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    // Message for task poster to verify task completion and release funds
    async sendVerifyTaskCompletion(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            performerAddress: Address; // The address of the performer being verified
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.verify_task_completion, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeAddress(opts.performerAddress)
                .endCell(),
        });
    }

    // Message for performer to submit proof of work
    async sendSubmitProof(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            proofHash: bigint; // Hash of the proof (e.g., IPFS CID hash)
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.submit_proof, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeUint(opts.proofHash, 256) // Assuming 256-bit hash
                .endCell(),
        });
    }

    // Message to raise a dispute
    async sendRaiseDispute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            reasonHash: bigint; // Hash of the dispute reason
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.raise_dispute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeUint(opts.reasonHash, 256) // Assuming 256-bit hash
                .endCell(),
        });
    }

    // Message for moderator to resolve a dispute (approving one side or the other)
    async sendResolveDispute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            winnerAddress: Address; // The address of the party winning the dispute
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.resolve_dispute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .storeAddress(opts.winnerAddress)
                .endCell(),
        });
    }
    
    // Message for performer to withdraw their portion of funds
    async sendWithdrawFunds(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint; // Value for gas (small amount)
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw_funds, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    // Message for task poster to cancel a task and receive a refund (if conditions met)
    async sendCancelTaskAndRefund(
        provider: ContractProvider,
        via: Sender,
        opts: {
            taskId: bigint;
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.cancel_task_and_refund, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.taskId, 64)
                .endCell(),
        });
    }

    // Message for Ziver treasury to withdraw accumulated fees
    async sendWithdrawFee(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint; // Value for gas
            queryID?: bigint;
        }
    ) {
        // This message doesn't need a taskId as it withdraws from the total accumulated fees
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw_fee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }


    // --- Getter Methods (for off-chain reads) ---

        // Getter for off-chain querying a specific task's details
    // You will need to implement the corresponding FunC getter named 'get_task_details' in your escrow_s_m.fc
    async getTaskDetails(provider: ContractProvider, taskId: bigint): Promise<TaskDetails | null> {
        try {
            const { stack } = await provider.get('get_task_details', [{ type: 'int', value: taskId }]);
            const reader = new TupleReader(stack);

            if (reader.items.length === 0) return null; // Task not found or empty return

            // Ensure the order and types match what your FunC getter will return
            const taskPosterAddress = reader.readAddress();
            const paymentPerPerformerAmount = reader.readBigNumber();
            const numberOfPerformersNeeded = reader.readBigNumber();
            const performersCompleted = reader.readCell(); // This will be the dictionary cell
            const completedPerformersCount = reader.readBigNumber(); // <-- ADD THIS LINE HERE
            const taskDescriptionHash = reader.readBigNumber();
            const taskGoalHash = reader.readBigNumber();
            const expiryTimestamp = reader.readBigNumber();
            const totalEscrowedFunds = reader.readBigNumber();
            const ziverFeePercentage = reader.readBigNumber();
            const moderatorAddress = reader.readAddress();
            const currentState = reader.readNumber() as EscrowState; // Cast number to our enum
            const proofSubmissionMap = reader.readCell();

            return {
                taskId, // This taskId was passed as an argument to the getter
                taskPosterAddress,
                paymentPerPerformerAmount,
                numberOfPerformersNeeded,
                performersCompleted: Dictionary.loadOf(0, performerCompletedKeyResolver, performerCompletedValueResolver, performersCompleted), // Load as Dictionary
                completedPerformersCount, // <-- ADD THIS TO THE RETURN OBJECT
                taskDescriptionHash,
                taskGoalHash,
                expiryTimestamp,
                totalEscrowedFunds,
                ziverFeePercentage,
                moderatorAddress,
                currentState,
                proofSubmissionMap: Dictionary.loadOf(0, proofSubmissionMapKeyResolver, proofSubmissionMapValueResolver, proofSubmissionMap), // Load as Dictionary
            };
        } catch (e) {
            console.error(`Error fetching task details for taskId ${taskId}:`, e);
            return null;
        }
    }

    // Getter for the Ziver Treasury Address
    async getZiverTreasuryAddress(provider: ContractProvider): Promise<Address> {
        // You will need to implement the corresponding FunC getter named 'get_ziver_treasury_address' in your escrow_s_m.fc
        const { stack } = await provider.get('get_ziver_treasury_address', []);
        return stack.readAddress();
    }

    // Getter for current accumulated Ziver fees (if you store this directly in the contract state)
    // This assumes a FunC getter named 'get_accumulated_fees'
    async getAccumulatedFees(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_accumulated_fees', []);
        return stack.readBigNumber();
    }
}
