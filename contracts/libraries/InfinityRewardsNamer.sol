// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.5.0;

import './SafeERC20Namer.sol';

// produces names for rewards pools using InfinityRewards's naming scheme
library InfinityRewardsNamer {
    string private constant TOKEN_PREFIX = 'Infinity Staking ';
    string private constant TOKEN_SEPARATOR = ' for ';
    string private constant TOKEN_SYMBOL_PREFIX = 'IR[';
    string private constant TOKEN_SYMBOL_SUFFIX = ']';

    // produces a pool descriptor in the format of `${prefix}${symbol0}${separator}${symbol1}`
    function poolName(
        address token0,
        address token1
    ) internal view returns (string memory) {
        return
            string(
                abi.encodePacked(
                    TOKEN_PREFIX,
                    SafeERC20Namer.tokenSymbol(token0),
                    TOKEN_SEPARATOR,
                    SafeERC20Namer.tokenSymbol(token1)
                )
            );
    }

    // produces a pool symbol in the format of `${prefix}${symbol}${suffix}`
    function poolSymbol(
        address token
    ) internal view returns (string memory) {
        return
            string(
                abi.encodePacked(
                    TOKEN_SYMBOL_PREFIX,
                    SafeERC20Namer.tokenSymbol(token),
                    TOKEN_SYMBOL_SUFFIX
                )
            );
    }
}