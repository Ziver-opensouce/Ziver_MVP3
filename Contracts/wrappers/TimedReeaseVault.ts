import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TimedReeaseVaultConfig = {};

export function timedReeaseVaultConfigToCell(config: TimedReeaseVaultConfig): Cell {
    return beginCell().endCell();
}

export class TimedReeaseVault implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new TimedReeaseVault(address);
    }

    static createFromConfig(config: TimedReeaseVaultConfig, code: Cell, workchain = 0) {
        const data = timedReeaseVaultConfigToCell(config);
        const init = { code, data };
        return new TimedReeaseVault(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
