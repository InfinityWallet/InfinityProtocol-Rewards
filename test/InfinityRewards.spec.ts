import chai, { expect } from 'chai'
import { Contract, BigNumber, constants } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { infinityRewardsFixture } from './fixtures'
import { REWARDS_DURATION, expandTo18Decimals, mineBlock, getApprovalDigest } from './utils'

import InfinityRewards from '../build/InfinityRewards.json'

chai.use(solidity)

describe('InfinityRewards', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, staker, secondStaker] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let infinityRewards: Contract
  let rewardsToken: Contract
  let stakingToken: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(infinityRewardsFixture)
    infinityRewards = fixture.infinityRewards
    rewardsToken = fixture.rewardsToken
    stakingToken = fixture.stakingToken
  })

  it('deploy cost', async () => {
    const infinityRewards = await deployContract(wallet, InfinityRewards, [])
    const receipt = await provider.getTransactionReceipt(infinityRewards.deployTransaction.hash)
    expect(receipt.gasUsed).to.eq('2532275')
  })

  const reward = expandTo18Decimals(100)
  async function start(reward: BigNumber): Promise<{ startTime: BigNumber; endTime: BigNumber }> {
    // send reward to the contract
    await rewardsToken.transfer(infinityRewards.address, reward)

    await infinityRewards.updateRewardAmount(REWARDS_DURATION)

    const startTime: BigNumber = await infinityRewards.lastUpdateTime()
    const endTime: BigNumber = await infinityRewards.periodFinish()
    expect(endTime).to.be.eq(startTime.add(REWARDS_DURATION))
    return { startTime, endTime }
  }

  it('updateRewardAmount: full', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(infinityRewards.address, stake)
    await infinityRewards.connect(staker).stake(stake)

    const { endTime } = await start(reward)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await infinityRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await infinityRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  })

  it('stakeWithPermit', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)

    // get permit
    const nonce = await stakingToken.nonces(staker.address)
    const deadline = constants.MaxUint256
    const digest = await getApprovalDigest(
      stakingToken,
      { owner: staker.address, spender: infinityRewards.address, value: stake },
      nonce,
      deadline
    )
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(staker.privateKey.slice(2), 'hex'))

    await infinityRewards.connect(staker).stakeWithPermit(stake, deadline, false, v, r, s)

    const { endTime } = await start(reward)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await infinityRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await infinityRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  })

  it('updateRewardAmount: ~half', async () => {
    const { startTime, endTime } = await start(reward)

    // fast-forward ~halfway through the reward window
    await mineBlock(provider, startTime.add(endTime.sub(startTime).div(2)).toNumber())

    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(infinityRewards.address, stake)
    await infinityRewards.connect(staker).stake(stake)
    const stakeStartTime: BigNumber = await infinityRewards.lastUpdateTime()

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await infinityRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await infinityRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.div(2).sub(rewardAmount).lte(reward.div(2).div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(endTime.sub(stakeStartTime)))
  }).retries(2) // TODO investigate flakiness

  it('updateRewardAmount: two stakers', async () => {
    // stake with first staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(infinityRewards.address, stake)
    await infinityRewards.connect(staker).stake(stake)

    const { startTime, endTime } = await start(reward)

    // fast-forward ~halfway through the reward window
    await mineBlock(provider, startTime.add(endTime.sub(startTime).div(2)).toNumber())

    // stake with second staker
    await stakingToken.transfer(secondStaker.address, stake)
    await stakingToken.connect(secondStaker).approve(infinityRewards.address, stake)
    await infinityRewards.connect(secondStaker).stake(stake)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await infinityRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await infinityRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)
    await infinityRewards.connect(secondStaker).exit()

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    const secondRewardAmount = await rewardsToken.balanceOf(secondStaker.address)
    const totalReward = rewardAmount.add(secondRewardAmount)

    // ensure results are within .01%
    expect(reward.sub(totalReward).lte(reward.div(10000))).to.be.true
    expect(totalReward.mul(3).div(4).sub(rewardAmount).lte(totalReward.mul(3).div(4).div(10000)))
    expect(totalReward.div(4).sub(secondRewardAmount).lte(totalReward.div(4).div(10000)))
  })
})
