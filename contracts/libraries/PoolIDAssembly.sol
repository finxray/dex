// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library PoolIDAssembly {
    /// @notice Creates a pool ID as a uint256 for use with ERC6909.
    /// @dev Must match off-chain calculation used in tests: keccak256(abi.encodePacked(asset0, asset1, quoter, markings)).
    function assemblePoolID(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings
    ) internal pure returns (uint256 poolID) {
        // Use Solidity encoding to match the test helper exactly
        poolID = uint256(keccak256(abi.encodePacked(asset0, asset1, quoter, markings)));
    }
}