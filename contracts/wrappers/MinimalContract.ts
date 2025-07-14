import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type MinimalContractConfig = {};

export function minimalContractConfigToCell(config: MinimalContractConfig): Cell {
    return beginCell().endCell();
}

export class MinimalContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromConfig(config: MinimalContractConfig, code: Cell, workchain = 0) {
        const data = minimalContractConfigToCell(config);
        const init = { code, data };
        return new MinimalContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendValue(provider: ContractProvider, via: Sender, valueToSet: bigint) {
        await provider.internal(via, {
            value: toNano('0.05'), // The 'toNano' function is used here
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x1, 32) // op
                .storeUint(valueToSet, 64)
                .endCell(),
        });
    }

    async getValue(provider: ContractProvider) {
        const result = await provider.get('get_value', []);
        return result.stack.readBigNumber();
    }
}
