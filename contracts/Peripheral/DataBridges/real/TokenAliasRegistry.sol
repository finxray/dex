// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ITokenAliasRegistry} from "../../../Core/interfaces/external/ITokenAliasRegistry.sol";

contract TokenAliasRegistry is ITokenAliasRegistry {
    address public immutable owner;

    // Chainlink Feed Registry base alias (e.g., WETH->ETH sentinel)
    mapping(address => address) public chainlinkBase;

    // RedStone feed id alias (token->feedId bytes32("SYMBOL"))
    mapping(address => bytes32) public redstoneFeedId;
    // RedStone decimals per token feed (defaults to 8)
    mapping(address => uint8) public redstoneDecimals;

    // Common Ethereum addresses
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address constant DAI  = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address constant UNI  = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;

    // Chainlink sentinels
    address constant USD_SENTINEL = address(840);
    address constant ETH_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant BTC_SENTINEL = address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB);

    error TokenAliasRegistry__NotOwner();
    modifier onlyOwner() { if (msg.sender != owner) revert TokenAliasRegistry__NotOwner(); _; }

    constructor() {
        owner = msg.sender;
        // Defaults
        chainlinkBase[WETH] = ETH_SENTINEL;
        chainlinkBase[WBTC] = BTC_SENTINEL;
        // Stables and majors mapping to themselves when base/quote exists vs USD
        chainlinkBase[USDC] = USDC;
        chainlinkBase[USDT] = USDT;
        chainlinkBase[DAI]  = DAI;
        chainlinkBase[UNI]  = UNI;

        // RedStone uses bytes32("SYMBOL") for short ids
        redstoneFeedId[WETH] = bytes32("ETH");
        redstoneFeedId[WBTC] = bytes32("BTC");
        redstoneFeedId[USDC] = bytes32("USDC");
        redstoneFeedId[USDT] = bytes32("USDT");
        redstoneFeedId[DAI]  = bytes32("DAI");
        redstoneFeedId[UNI]  = bytes32("UNI");

        redstoneDecimals[WETH] = 8;
        redstoneDecimals[WBTC] = 8;
        redstoneDecimals[USDC] = 8;
        redstoneDecimals[USDT] = 8;
        redstoneDecimals[DAI]  = 8;
        redstoneDecimals[UNI]  = 8;
    }

    function setChainlinkBase(address token, address base) external onlyOwner { chainlinkBase[token] = base; }
    function setRedstoneFeedId(address token, bytes32 id) external onlyOwner { redstoneFeedId[token] = id; }
    function setRedstoneDecimals(address token, uint8 dec) external onlyOwner { redstoneDecimals[token] = dec; }

    function getChainlinkBase(address token) external view returns (address) { return chainlinkBase[token]; }
    function getRedstoneFeedId(address token) external view returns (bytes32) { return redstoneFeedId[token]; }
    function getRedstoneDecimals(address token) external view returns (uint8) {
        uint8 d = redstoneDecimals[token];
        return d == 0 ? 8 : d;
    }
}
