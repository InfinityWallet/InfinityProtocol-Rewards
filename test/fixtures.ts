import chai from 'chai'
import { Contract, Wallet, BigNumber, providers } from 'ethers'
import { solidity, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utils'

import TestERC20 from '../build/TestERC20.json'
import InfinityRewards from '../build/InfinityRewards.json'
import InfinityRewardsFactory from '../build/InfinityRewardsFactory.json'

chai.use(solidity)

interface InfinityRewardsFixture {
  infinityRewards: Contract
  rewardsToken: Contract
  stakingToken: Contract
}

export async function infinityRewardsFixture([wallet]: Wallet[]): Promise<InfinityRewardsFixture> {
  const rewardsToken = await deployContract(wallet, TestERC20, [expandTo18Decimals(1000000)])
  const stakingToken = await deployContract(wallet, TestERC20, [expandTo18Decimals(1000000)])

  const infinityRewards = await deployContract(wallet, InfinityRewards, [])
  await infinityRewards.initialize(rewardsToken.address, stakingToken.address)

  return { infinityRewards, rewardsToken, stakingToken }
}

interface InfinityRewardsFactoryFixture {
  rewardsToken: Contract
  stakingToken: Contract
  rewardAmount: BigNumber
  infinityRewardsFactory: Contract
}

export async function infinityRewardsFactoryFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<InfinityRewardsFactoryFixture> {
  const rewardsToken = await deployContract(wallet, TestERC20, [expandTo18Decimals(1_000_000_000)])
  const stakingToken = await deployContract(wallet, TestERC20, [expandTo18Decimals(1_000_000_000)])
  const rewardAmount: BigNumber = expandTo18Decimals(10)
  const infinityRewardsFactory = await deployContract(wallet, InfinityRewardsFactory, [])

  return { rewardsToken, stakingToken, rewardAmount, infinityRewardsFactory }
}
