// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestTokenB - Simple ERC20 token for testing
/// @notice This token is for testing purposes only
contract TestTokenB is ERC20 {
    constructor() ERC20("Test Token B", "TTB") {
        // Mint 1,000,000 tokens to deployer for testing
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    /// @notice Mint tokens to any address (for testing convenience)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /// @notice Burn tokens from caller (for testing convenience)
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}