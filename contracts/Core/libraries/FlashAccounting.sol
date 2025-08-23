// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title FlashAccounting
/// @notice Minimal transient-storage based per-session ledger for user/token deltas
library FlashAccounting {
    bytes32 private constant FLASH_DOMAIN = keccak256("dex.flash.accounting:v1");
    bytes32 private constant FLASH_SESSION = keccak256("dex.flash.session:v1");
    bytes32 private constant FLASH_ACTIVE_USER = keccak256("dex.flash.active.user:v1");

    function _slot(address callerContract, address user, address token) private pure returns (bytes32 slot) {
        // Unique slot per (contract, user, token)
        slot = keccak256(abi.encodePacked(FLASH_DOMAIN, callerContract, user, token));
    }

    /// @notice Add to the user's net delta for a given token
    /// @dev Negative delta means the user owes token; positive means the user is owed token
    function addDelta(address user, address token, int256 delta) internal {
        bytes32 slot = _slot(address(this), user, token);
        assembly {
            let old := tload(slot)
            let new := add(old, delta)
            tstore(slot, new)
        }
    }

    /// @notice Get the user's current net delta for a given token
    function getDelta(address user, address token) internal view returns (int256 current) {
        bytes32 slot = _slot(address(this), user, token);
        assembly {
            current := tload(slot)
        }
    }

    /// @notice Clear the user's delta for a given token
    function clearDelta(address user, address token) internal {
        bytes32 slot = _slot(address(this), user, token);
        assembly {
            tstore(slot, 0)
        }
    }

    function _sessionSlot(address callerContract, address user) private pure returns (bytes32 slot) {
        slot = keccak256(abi.encodePacked(FLASH_SESSION, callerContract, user));
    }

    function startSession(address user) internal {
        bytes32 slot = _sessionSlot(address(this), user);
        assembly {
            tstore(slot, 1)
        }
    }

    function endSession(address user) internal {
        bytes32 slot = _sessionSlot(address(this), user);
        assembly {
            tstore(slot, 0)
        }
    }

    function isSessionActive(address user) internal view returns (bool active) {
        bytes32 slot = _sessionSlot(address(this), user);
        assembly {
            active := tload(slot)
        }
    }

    function setActiveUser(address user) internal {
        bytes32 slot = keccak256(abi.encodePacked(FLASH_ACTIVE_USER, address(this)));
        assembly {
            tstore(slot, user)
        }
    }

    function clearActiveUser() internal {
        bytes32 slot = keccak256(abi.encodePacked(FLASH_ACTIVE_USER, address(this)));
        assembly {
            tstore(slot, 0)
        }
    }

    function getActiveUser() internal view returns (address user) {
        bytes32 slot = keccak256(abi.encodePacked(FLASH_ACTIVE_USER, address(this)));
        assembly {
            user := tload(slot)
        }
    }
}


