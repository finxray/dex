// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CommitRevealLib
/// @notice Library for commit-reveal MEV protection
/// @dev Trader-controlled protection via traderProtection flags
library CommitRevealLib {
    
    // Custom errors
    error CommitReveal__InvalidCommitment();
    error CommitReveal__CommitmentTooNew();
    error CommitReveal__CommitmentExpired();
    error CommitReveal__InvalidNonce();
    
    struct CommitData {
        // Commit-reveal tracking: commitment hash → block number when committed
        mapping(bytes32 => uint32) commitments;
        // Address nonces to prevent replay attacks
        mapping(address => uint64) addressNonces;
    }
    
    // Events
    event SwapCommitted(bytes32 indexed commitment, address indexed trader, uint32 blockNumber);
    event CommittedSwapExecuted(bytes32 indexed commitment, address indexed trader);
    
    /// @notice Store a commitment for future reveal
    /// @param data Commit data storage
    /// @param commitment Hash of swap parameters + nonce + salt
    /// @param trader Address making the commitment
    function storeCommitment(
        CommitData storage data,
        bytes32 commitment,
        address trader
    ) internal {
        data.commitments[commitment] = uint32(block.number);
        emit SwapCommitted(commitment, trader, uint32(block.number));
    }
    
    /// @notice Validate and consume a commitment for execution
    /// @param data Commit data storage
    /// @param commitment Hash to validate
    /// @param trader Address executing the commitment
    /// @param currentNonce Expected nonce for this trader
    /// @return valid Whether commitment is valid for execution
    function validateAndConsumeCommitment(
        CommitData storage data,
        bytes32 commitment,
        address trader,
        uint64 currentNonce
    ) internal returns (bool valid) {
        uint32 commitBlock = data.commitments[commitment];
        
        // Check commitment exists
        if (commitBlock == 0) {
            revert CommitReveal__InvalidCommitment();
        }
        
        // Check commitment is old enough (at least 1 block)
        if (block.number <= commitBlock) {
            revert CommitReveal__CommitmentTooNew();
        }
        
        // Check commitment hasn't expired (max 256 blocks = ~1 hour)
        if (block.number > commitBlock + 256) {
            revert CommitReveal__CommitmentExpired();
        }
        
        // Validate nonce
        if (currentNonce != data.addressNonces[trader]) {
            revert CommitReveal__InvalidNonce();
        }
        
        // Clear commitment and increment nonce
        delete data.commitments[commitment];
        data.addressNonces[trader] = currentNonce + 1;
        
        emit CommittedSwapExecuted(commitment, trader);
        return true;
    }
    
    /// @notice Generate commitment hash from swap parameters
    /// @param asset0 First asset address
    /// @param asset1 Second asset address  
    /// @param quoter Quoter contract address
    /// @param markings Pool markings
    /// @param amountIn Input amount
    /// @param zeroForOne Swap direction
    /// @param minAmountOut Minimum output amount
    /// @param nonce Trader's current nonce
    /// @param trader Trader address
    /// @param salt Random salt for uniqueness
    /// @return commitment Hash of all parameters
    function generateCommitment(
        address asset0,
        address asset1,
        address quoter,
        bytes3 markings,
        uint256 amountIn,
        bool zeroForOne,
        uint256 minAmountOut,
        uint64 nonce,
        address trader,
        bytes32 salt
    ) internal pure returns (bytes32 commitment) {
        commitment = keccak256(abi.encode(
            asset0, asset1, quoter, markings,
            amountIn, zeroForOne, minAmountOut,
            nonce, trader, salt
        ));
    }
    
    /// @notice Get current nonce for an address
    /// @param data Commit data storage
    /// @param trader Address to check
    /// @return nonce Current nonce
    function getCurrentNonce(
        CommitData storage data,
        address trader
    ) internal view returns (uint64 nonce) {
        return data.addressNonces[trader];
    }
}
