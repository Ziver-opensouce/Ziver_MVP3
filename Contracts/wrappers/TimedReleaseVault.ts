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

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, body: Cell | null = null) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body || beginCell().endCell(),
        });
    }

    // Updated: More precise type for release_timestamp (bigint)
    async getContractData(provider: ContractProvider): Promise<{ owner_address: Address, release_timestamp: bigint, is_released: number }> {
        const { stack } = await provider.get('get_contract_data', []);
        return {
            owner_address: stack.readAddress(),
            release_timestamp: stack.readBigNumber(), // Use readBigNumber for 64-bit uint
            is_released: stack.readNumber(),
        };
    }

    // Optional: Add individual getter methods for clarity
    async getOwner(provider: ContractProvider): Promise<Address> {
        const { stack } = await provider.get('get_owner', []);
        return stack.readAddress();
    }

    async getReleaseTimestamp(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_release_timestamp', []);
        return stack.readBigNumber();
    }

    async getIsReleased(provider: ContractProvider): Promise<number> {
        const { stack } = await provider.get('get_is_released', []);
        return stack.readNumber();
    }
}
