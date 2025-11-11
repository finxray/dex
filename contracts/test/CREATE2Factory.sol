// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title CREATE2Factory
 * @notice Factory contract that uses CREATE2 to deploy contracts at deterministic addresses
 */
contract CREATE2Factory {
    event Deployed(address indexed addr, bytes32 salt);

    /**
     * @notice Deploy a contract using CREATE2
     * @param bytecode The bytecode of the contract to deploy
     * @param salt The salt for CREATE2 (use same salt for same address)
     * @return addr The address where the contract was deployed
     */
    function deploy(bytes memory bytecode, bytes32 salt) external returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(addr != address(0), "CREATE2 failed");
        emit Deployed(addr, salt);
    }

    /**
     * @notice Compute the address where a contract will be deployed
     * @param bytecode The bytecode of the contract
     * @param salt The salt for CREATE2
     * @return The computed address
     */
    function computeAddress(bytes memory bytecode, bytes32 salt) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}

