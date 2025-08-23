// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC6909Claims} from "./interfaces/external/IERC6909Claims.sol";

/// @notice Minimalist and gas efficient standard ERC6909 implementation.
/// @author Uniswap V4 (https://github.com/Uniswap/v4-core/blob/main/src/ERC6909.sol)
/// @dev This contract has been modified from the implementation at the above link.
abstract contract ERC6909 is IERC6909Claims {
    /*//////////////////////////////////////////////////////////////
                             ERC6909 STORAGE
    //////////////////////////////////////////////////////////////*/

    mapping(address owner => mapping(address operator => bool approved)) internal _isOperator; 

    // User LP share balances (address owner -> poolID -> balance)
    mapping(address owner => mapping(uint256 id => uint256 balance)) internal _balanceOf;

    mapping(address owner => mapping(address spender => mapping(uint256 id => uint256 amount))) internal _allowance;

    /// @notice Owner balance of an id.
    function balanceOf(address owner, uint256 id) external view returns (uint256) {
        return _balanceOf[owner][id];
    }

    /// @notice Spender allowance of an id.
    function allowance(address owner, address spender, uint256 id) external view returns (uint256) {
        return _allowance[owner][spender][id];
    }

    /// @notice Checks if a spender is approved by an owner as an operator
    function isOperator(address owner, address spender) external view returns (bool) {
        return _isOperator[owner][spender];
    }

    /*//////////////////////////////////////////////////////////////
                              ERC6909 LOGIC
    //////////////////////////////////////////////////////////////*/

    function transfer(address receiver, uint256 id, uint256 amount) public virtual returns (bool) {
        _balanceOf[msg.sender][id] -= amount;

        _balanceOf[receiver][id] += amount;

        emit Transfer(msg.sender, msg.sender, receiver, id, amount);

        return true;
    }

    function transferFrom(address sender, address receiver, uint256 id, uint256 amount) public virtual returns (bool) {
        if (msg.sender != sender && !_isOperator[sender][msg.sender]) {
            uint256 allowed = _allowance[sender][msg.sender][id];
            if (allowed != type(uint256).max) _allowance[sender][msg.sender][id] = allowed - amount;
        }

        _balanceOf[sender][id] -= amount;

        _balanceOf[receiver][id] += amount;

        emit Transfer(msg.sender, sender, receiver, id, amount);

        return true;
    }

    function approve(address spender, uint256 id, uint256 amount) public virtual returns (bool) {
        _allowance[msg.sender][spender][id] = amount;

        emit Approval(msg.sender, spender, id, amount);

        return true;
    }

    function setOperator(address operator, bool approved) public virtual returns (bool) {
        _isOperator[msg.sender][operator] = approved;

        emit OperatorSet(msg.sender, operator, approved);

        return true;
    }

    /*//////////////////////////////////////////////////////////////
                              ERC165 LOGIC
    //////////////////////////////////////////////////////////////*/

    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC165 Interface ID for ERC165
            || interfaceId == 0x0f632fb3; // ERC165 Interface ID for ERC6909
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL MINT/BURN LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint LP shares to user
    function _mint(address receiver, uint256 id, uint256 amount) internal virtual {
        _balanceOf[receiver][id] += amount;
        emit Transfer(msg.sender, address(0), receiver, id, amount);
    }

    /// @notice Burn LP shares from user
    function _burn(address sender, uint256 id, uint256 amount) internal virtual {
        _balanceOf[sender][id] -= amount;
        emit Transfer(msg.sender, sender, address(0), id, amount);
    }
}