pragma solidity ^0.6.7;

import './InfinityRewards.sol';

contract InfinityRewardsFactory {
    mapping(address => mapping(address => address)) public getPool; // getPool(rewardsToken, stakingToken)
    address[] public allPools;

    event PoolCreated(address indexed rewardsToken, address indexed stakingToken, address pool, uint);

    function allPoolsLength() external view returns (uint) {
        return allPools.length;
    }

    function createPool(address rewardsToken, address stakingToken) public returns (address pool) {
        require(rewardsToken != address(0) && stakingToken != address(0), "Zero address");
        require(getPool[rewardsToken][stakingToken] == address(0), "Pool already exists");
        bytes memory bytecode = type(InfinityRewards).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(rewardsToken, stakingToken));
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        InfinityRewards(pool).initialize(rewardsToken, stakingToken);
        getPool[rewardsToken][stakingToken] = pool;
        allPools.push(pool);
        emit PoolCreated(rewardsToken, stakingToken, pool, allPools.length);
    }

    function distributeReward(address rewardsToken, address stakingToken, uint duration, uint extraReward) external {
        address pool = getPool[rewardsToken][stakingToken];
        if (pool == address(0)) pool = createPool(rewardsToken, stakingToken);
        if (extraReward > 0) TransferHelper.safeTransferFrom(rewardsToken, msg.sender, pool, extraReward);
        InfinityRewards(pool).updateRewardAmount(duration);
    }
}