pragma solidity ^0.6.7;

import './libraries/InfinityRewardsNamer.sol';

library SafeMath {
    function add(uint a, uint b) internal pure returns (uint c) {
        require((c = a + b) >= a, "Addition overflow");
    }

    function sub(uint a, uint b) internal pure returns (uint c) {
        require((c = a - b) <= a, "Subtraction underflow");
    }
    
    function mul(uint a, uint b) internal pure returns (uint c) {
        require(b == 0 || (c = a * b) / b == a, "Multiplication overflow");
    }

    function div(uint a, uint b) internal pure returns (uint) {
        require(b > 0, "Division by zero");
        return a / b;
    }
}

library TransferHelper {
    function safeTransfer(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }
}

interface IToken {
    function decimals() external view returns (uint8);
    function balanceOf(address owner) external view returns (uint);
    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;
}

contract InfinityRewards {
    using SafeMath for uint;

    string public name;
    string public symbol;
    uint8 public decimals;

    address public immutable factory;
    address public rewardsToken;
    address public stakingToken;
    uint public constant minRewardsDuration = 14 days;
    uint public periodFinish;
    uint public rewardRate;
    uint public lastUpdateTime;
    uint public rewardPerTokenStored;
    uint public rewardsOwed;

    mapping(address => uint) public userRewardPerTokenPaid;
    mapping(address => uint) public rewards;

    uint public totalSupply;
    mapping(address => uint) public balanceOf;

    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "locked");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // update pool rewards, rewards owed and specified account rewards
    modifier updateReward(address account) {
        uint _rewardPerToken = rewardPerTokenStored; // gas saving
        uint _lastTimeRewardApplicable = lastTimeRewardApplicable();
        uint _totalSupply = totalSupply;
        if (_totalSupply > 0) {
            uint extraRewardPerToken = _lastTimeRewardApplicable.sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(_totalSupply);
            if (extraRewardPerToken > 0) {
                _rewardPerToken = _rewardPerToken.add(extraRewardPerToken);
                rewardPerTokenStored = _rewardPerToken;
                rewardsOwed = rewardsOwed.add(extraRewardPerToken.mul(_totalSupply));
            }
        }
        lastUpdateTime = _lastTimeRewardApplicable;
        if (account != address(0)) {
            uint extraEarnings = balanceOf[account].mul(_rewardPerToken.sub(userRewardPerTokenPaid[account]));
            if (extraEarnings > 0) {
                rewards[account] = rewards[account].add(extraEarnings / 1e18);
                rewardsOwed = rewardsOwed.sub(extraEarnings % 1e18); // free any remainder
            }
            userRewardPerTokenPaid[account] = _rewardPerToken;
        }
        _;
    }

    event Transfer(address indexed from, address indexed to, uint value);
    event RewardUpdated(uint rewardRate, uint periodFinish);
    event Staked(address indexed user, uint amount);
    event Withdrawn(address indexed user, uint amount);
    event RewardPaid(address indexed user, uint reward);

    constructor() public {
        factory = msg.sender;
    }

    // initialize tokens only when pool is created
    function initialize(address rewardsToken_, address stakingToken_) external {
        require(msg.sender == factory, 'Forbidden');
        IToken(rewardsToken_).balanceOf(address(this)); // check token
        rewardsToken = rewardsToken_;
        stakingToken = stakingToken_;
        name = InfinityRewardsNamer.poolName(stakingToken_, rewardsToken_);
        symbol = InfinityRewardsNamer.poolSymbol(stakingToken_);
        decimals = IToken(stakingToken_).decimals();
    }

    // **** VIEW FUNCTIONS ****

    function lastTimeRewardApplicable() public view returns (uint) {
        uint _periodFinish = periodFinish;
        return block.timestamp < _periodFinish ? block.timestamp : _periodFinish;
    }

    function rewardPerToken() public view returns (uint) {
        uint _totalSupply = totalSupply;
        if (_totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored.add(lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(_totalSupply));
    }

    function earned(address account) external view returns (uint) {
        return balanceOf[account].mul(rewardPerToken().sub(userRewardPerTokenPaid[account])).div(1e18).add(rewards[account]);
    }

    function currentRewardsOwed() public view returns (uint) {
        uint _totalSupply = totalSupply;
        if (_totalSupply == 0) return rewardsOwed;
        uint extraRewardPerToken = lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(_totalSupply);
        return rewardsOwed.add(extraRewardPerToken.mul(_totalSupply));
    }

    function rewardsAvailable() public view returns (uint) {
        address _rewardsToken = rewardsToken;
        uint rewardsBalance = IToken(_rewardsToken).balanceOf(address(this));
        if (_rewardsToken == stakingToken) rewardsBalance = rewardsBalance.sub(totalSupply);
        uint _rewardsOwed = currentRewardsOwed();
        _rewardsOwed = _rewardsOwed % 1e18 == 0 ? _rewardsOwed / 1e18 : (_rewardsOwed / 1e18) + 1;
        return rewardsBalance.sub(_rewardsOwed);
    }

    // **** STAKING FUNCTIONS ****
    
    function stakeWithPermit(uint amount, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external {
        uint approval = approveMax ? uint(-1) : amount;
        IToken(stakingToken).permit(msg.sender, address(this), approval, deadline, v, r, s);
        stake(amount);
    }

    function stake(uint amount) public lock updateReward(msg.sender) {
        address _stakingToken = stakingToken;
        uint balanceBefore = IToken(_stakingToken).balanceOf(address(this));
        TransferHelper.safeTransferFrom(_stakingToken, msg.sender, address(this), amount);
        uint amountReceived = IToken(_stakingToken).balanceOf(address(this)).sub(balanceBefore);
        require(amountReceived > 0, "Cannot stake 0");
        totalSupply = totalSupply.add(amountReceived);
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amountReceived);
        emit Transfer(address(0), msg.sender, amountReceived);
        emit Staked(msg.sender, amountReceived);
    }

    function withdraw(uint amount) public lock updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        totalSupply = totalSupply.sub(amount);
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(amount);
        TransferHelper.safeTransfer(stakingToken, msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public lock updateReward(msg.sender) {
        uint reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsOwed = rewardsOwed.sub(reward.mul(1e18));
            TransferHelper.safeTransfer(rewardsToken, msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(balanceOf[msg.sender]);
        getReward();
    }

    // distribute available rewardsToken balance over the desired duration
    function updateRewardAmount(uint duration) external lock updateReward(address(0)) {
        require (duration >= minRewardsDuration, "Duration less than minRewardsDuration");
        uint reward = rewardsAvailable();
        uint newRewardRate = reward.div(duration);
        require (newRewardRate > 0, "No reward to distribute");
        
        uint _periodFinish = periodFinish;
        if (block.timestamp < _periodFinish) {
            uint _rewardRate = rewardRate;
            require(newRewardRate >= _rewardRate, "Insufficient rewardRate");
            uint periodRemaining = _periodFinish.sub(block.timestamp);
            if (duration < periodRemaining) {
                uint rewardRemaining = periodRemaining.mul(_rewardRate);
                require(reward >= rewardRemaining.mul(3), "Insufficient reward to decrease duration");
            }
        }
        
        rewardRate = newRewardRate;
        lastUpdateTime = block.timestamp;
        uint newPeriodFinish = block.timestamp.add(duration);
        periodFinish = newPeriodFinish;
        emit RewardUpdated(newRewardRate, newPeriodFinish);
    }
}