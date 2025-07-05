import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TimedReleaseVaultConfig = {};

export function timedReleaseVaultConfigToCell(config: TimedReleaseVaultConfig): Cell {
    return beginCell().endCell();
}

export class TimedReleaseVault implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new TimedReleaseVault(address);
    }

    static createFromConfig(config: TimedReleaseVaultConfig, code: Cell, workchain = 0) {
        const data = timedReleaseVaultConfigToCell(config);
        const init = { code, data };
        return new TimedReleaseVault(contractAddress(workchain, init), init);
    }

    // Modified sendDeploy to accept an optional 'body' argument
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, body: Cell | null = null) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body || beginCell().endCell(), // Use the provided body, or an empty one if not provided
        });
    }

    // RECOMMENDED: Add a method to fetch contract data for testing purposes
    // This will allow you to assert the contract's state in your tests.
    async getContractData(provider: ContractProvider) {
        const { stack } = await provider.get('get_contract_data', []); // Assuming get_contract_data is a get-method
        // You'll need to adapt this parsing based on how your parse_data() in FunC works and what get_contract_data returns
        // Example: if get_contract_data returns owner_address, release_timestamp, is_released
        return {
            owner_address: stack.readAddress(),
            release_timestamp: stack.readNumber(),
            is_released: stack.readNumber(),
        };
    }
}
