// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ReentrancyGuard
/// @notice Reentrancy guard implemented with EIP-1153 transient storage
abstract contract ReentrancyGuard {
    // Base domain separator for guard slots
    bytes32 private constant _REENTRANCY_GUARD_DOMAIN = keccak256("dex.reentrancy.guard:v1");

    modifier nonReentrant() {
        _enterReentrancyGuard(_globalGuardSlot());
        _;
        _exitReentrancyGuard(_globalGuardSlot());
    }

    modifier nonReentrantKey(bytes32 key) {
        bytes32 slot = _keyedGuardSlot(key);
        _enterReentrancyGuard(slot);
        _;
        _exitReentrancyGuard(slot);
    }

    function _globalGuardSlot() internal view returns (bytes32 slot) {
        slot = keccak256(abi.encodePacked(_REENTRANCY_GUARD_DOMAIN, address(this)));
    }

    function _keyedGuardSlot(bytes32 key) internal view returns (bytes32 slot) {
        slot = keccak256(abi.encodePacked(_REENTRANCY_GUARD_DOMAIN, address(this), key));
    }

    function _enterReentrancyGuard(bytes32 slot) private {
        assembly {
            if tload(slot) { revert(0, 0) }
            tstore(slot, 1)
        }
    }

    function _exitReentrancyGuard(bytes32 slot) private {
        assembly {
            tstore(slot, 0)
        }
    }
}

