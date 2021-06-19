import chai, { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { infinityRewardsFactoryFixture } from './fixtures'
import { mineBlock, REWARDS_DURATION } from './utils'

import InfinityRewards from '../build/InfinityRewards.json'

chai.use(solidity)

describe('InfinityRewardsFactory', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, wallet1] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let rewardsToken: Contract
  let rewardAmount: BigNumber
  let infinityRewardsFactory: Contract
  let stakingToken: Contract

  beforeEach('load fixture', async () => {
    const fixture = await loadFixture(infinityRewardsFactoryFixture)
    rewardsToken = fixture.rewardsToken
    rewardAmount = fixture.rewardAmount
    infinityRewardsFactory = fixture.infinityRewardsFactory
    stakingToken = fixture.stakingToken
  })

  it('deployment gas', async () => {
    const receipt = await provider.getTransactionReceipt(infinityRewardsFactory.deployTransaction.hash)
    expect(receipt.gasUsed).to.eq('2980177')
  })

  describe('#createPool', () => {
    it('pushes the pool into the list', async () => {
      await infinityRewardsFactory.createPool(rewardsToken.address, stakingToken.address)
      const pool = await infinityRewardsFactory.getPool(rewardsToken.address, stakingToken.address)
      expect(await infinityRewardsFactory.allPools(0)).to.eq(pool)
    })

    it('fails if called twice for same tokens', async () => {
      await infinityRewardsFactory.createPool(rewardsToken.address, stakingToken.address)
      await expect(infinityRewardsFactory.createPool(rewardsToken.address, stakingToken.address)).to.revertedWith(
        'Pool already exists'
      )
    })

    it('deployed infinity rewards has correct parameters', async () => {
      await infinityRewardsFactory.createPool(rewardsToken.address, stakingToken.address)
      const infinityRewardsAddress = await infinityRewardsFactory.getPool(
        rewardsToken.address,
        stakingToken.address
      )
      const infinityRewards = new Contract(infinityRewardsAddress, InfinityRewards.abi, provider)
      expect(await infinityRewards.factory()).to.eq(infinityRewardsFactory.address)
      expect(await infinityRewards.rewardsToken()).to.eq(rewardsToken.address)
      expect(await infinityRewards.stakingToken()).to.eq(stakingToken.address)
    })
  })

  describe('#distributeReward', () => {
    it('transfers reward to pool and starts rewards', async () => {
      await rewardsToken.approve(infinityRewardsFactory.address, rewardAmount)
      await infinityRewardsFactory.distributeReward(rewardsToken.address, stakingToken.address, REWARDS_DURATION, rewardAmount)
      const pool = await infinityRewardsFactory.getPool(rewardsToken.address, stakingToken.address)
      expect(await rewardsToken.balanceOf(pool)).to.eq(rewardAmount)

      const infinityRewards = new Contract(pool, InfinityRewards.abi, provider)
      expect(await infinityRewards.rewardsAvailable()).to.eq(rewardAmount)
      const { timestamp: now } = await provider.getBlock('latest')
      expect(await infinityRewards.lastUpdateTime()).to.be.eq(now)
      expect(await infinityRewards.periodFinish()).to.be.eq(now + REWARDS_DURATION)
    })
  })
})
