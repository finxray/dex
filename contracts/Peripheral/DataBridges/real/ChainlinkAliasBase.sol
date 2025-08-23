// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Abstract base that provides major token aliasing for Chainlink Feed Registry
abstract contract ChainlinkAliasBase {
    // Chainlink registry sentinels
    address internal constant USD_SENTINEL = address(840);
    address internal constant ETH_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address internal constant BTC_SENTINEL = address(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB);

    // Common mainnet wrapped tokens
    address internal constant WETH_MAINNET = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant WBTC_MAINNET = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    // Optional additional aliases provided by deployer
    mapping(address => address) internal baseAlias; // token -> canonical sentinel/base

    constructor(address[] memory aliases, address[] memory targets) {
        // Defaults
        baseAlias[WETH_MAINNET] = ETH_SENTINEL;
        baseAlias[WBTC_MAINNET] = BTC_SENTINEL;
        require(aliases.length == targets.length, "alias len");
        for (uint256 i = 0; i < aliases.length; i++) {
            baseAlias[aliases[i]] = targets[i];
        }
    }

    function _aliasBase(address base) internal view returns (address) {
        address aliased = baseAlias[base];
        return aliased == address(0) ? base : aliased;
    }
}
