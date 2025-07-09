import { Config } from 'jest';

const config: Config = {
    preset: '@ton/blueprint/jest-preset.json',
    // No moduleNameMapper needed since your tsconfig.json does not use "paths"
};

export default config;
