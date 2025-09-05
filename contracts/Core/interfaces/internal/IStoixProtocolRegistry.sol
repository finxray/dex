// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IProtocolRegistry
/// @notice Interface for protocol governance registry
interface IProtocolRegistry {
    
    /// @notice Register pool when created
    /// @param poolId Pool identifier
    /// @param quoter Quoter address used
    function registerPool(uint256 poolId, address quoter) external;
    
    /// @notice Validate if operation is allowed
    /// @param poolId Pool identifier
    /// @param operationType Operation type (0=swap, 1=addLiquidity, 2=removeLiquidity)
    /// @return allowed Whether operation is allowed
    function validateOperation(uint256 poolId, uint8 operationType) external view returns (bool allowed);
    
    /// @notice Get pool information
    /// @param poolId Pool identifier
    /// @return poolType Type of pool
    /// @return emergencyState Current emergency state
    /// @return effectiveState Effective state (considering global controls)
    function getPoolInfo(uint256 poolId) external view returns (
        uint8 poolType,
        uint8 emergencyState, 
        uint8 effectiveState
    );
}
