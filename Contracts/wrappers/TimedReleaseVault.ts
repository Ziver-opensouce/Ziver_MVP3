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

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
