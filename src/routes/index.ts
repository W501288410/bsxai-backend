import Router from 'koa-router'
import { AuthController } from '../controllers/authController'
import { UserController } from '../controllers/userController'
import { ApiMallController } from '../controllers/apiMallController'
import { ToolMallController } from '../controllers/toolMallController'
import { CustomMallController } from '../controllers/customMallController'
import { AdminController } from '../controllers/adminController'
import { DistributionController } from '../controllers/distributionController'
import { RiskController } from '../controllers/riskController'
import { ChannelController } from '../controllers/channelController'
import { adminAuth } from '../middleware/security'

// === 认证路由（不需要登录）===
export const authRoutes = new Router({ prefix: '/api/auth' })
authRoutes.post('/register', AuthController.register)
authRoutes.post('/login', AuthController.login)
authRoutes.post('/send-sms', AuthController.sendSms)

// === 用户路由 ===
export const userRoutes = new Router({ prefix: '/api/user' })
userRoutes.get('/info', UserController.getInfo)
userRoutes.put('/profile', UserController.updateProfile)
userRoutes.post('/verify-real-name', UserController.verifyRealName)
userRoutes.post('/upgrade-developer', UserController.upgradeToDeveloper)
userRoutes.get('/balance', UserController.getBalance)
userRoutes.post('/recharge', UserController.recharge)
userRoutes.get('/transactions', UserController.getTransactions)

// === API 中转商城 ===
export const apiMallRoutes = new Router({ prefix: '/api/api-mall' })
apiMallRoutes.get('/products', ApiMallController.getProducts)
apiMallRoutes.get('/products/:id', ApiMallController.getProductDetail)
apiMallRoutes.post('/orders', ApiMallController.createOrder)
apiMallRoutes.get('/orders', ApiMallController.getOrders)
apiMallRoutes.post('/call/:id', ApiMallController.callApi)
apiMallRoutes.post('/check-sensitive', ApiMallController.checkSensitive)

// === AI 工具商城 ===
export const toolMallRoutes = new Router({ prefix: '/api/tool-mall' })
toolMallRoutes.get('/tools', ToolMallController.getTools)
toolMallRoutes.get('/tools/:id', ToolMallController.getToolDetail)
toolMallRoutes.post('/tools', ToolMallController.createTool)
toolMallRoutes.post('/subscribe', ToolMallController.subscribe)
toolMallRoutes.get('/subscriptions', ToolMallController.getSubscriptions)
toolMallRoutes.post('/review', ToolMallController.createReview)
toolMallRoutes.get('/my-tools', ToolMallController.getMyTools)

// === 悬赏定制商城 ===
export const customMallRoutes = new Router({ prefix: '/api/custom-mall' })
customMallRoutes.get('/requirements', CustomMallController.getRequirements)
customMallRoutes.get('/requirements/:id', CustomMallController.getRequirementDetail)
customMallRoutes.post('/requirements', CustomMallController.createRequirement)
customMallRoutes.post('/bids', CustomMallController.createBid)
customMallRoutes.put('/bids/:id/select', CustomMallController.selectBid)
customMallRoutes.post('/arbitrations', CustomMallController.createArbitration)
customMallRoutes.put('/requirements/:id/complete', CustomMallController.completeRequirement)

// === 分销路由 ===
export const distributionRoutes = new Router({ prefix: '/api/distribution' })
distributionRoutes.get('/invite-info', DistributionController.getMyInviteInfo)
distributionRoutes.get('/team', DistributionController.getMyTeam)
distributionRoutes.get('/commissions', DistributionController.getMyCommissions)
distributionRoutes.get('/commission-records', DistributionController.getCommissionRecords)

// === 管理后台路由（需要管理员权限）===
export const adminRoutes = new Router({ prefix: '/api/admin' })
adminRoutes.use(adminAuth)
// 看板
adminRoutes.get('/dashboard', AdminController.getDashboard)
adminRoutes.get('/revenue-trend', AdminController.getRevenueTrend)
adminRoutes.get('/order-trend', AdminController.getOrderTrend)
// 用户管理
adminRoutes.get('/users', AdminController.getUsers)
adminRoutes.put('/users/:id/status', AdminController.updateUserStatus)
// API 商品
adminRoutes.get('/products', AdminController.getProducts)
adminRoutes.post('/products', AdminController.createProduct)
adminRoutes.put('/products/:id', AdminController.updateProduct)
adminRoutes.put('/products/:id/status', AdminController.updateProductStatus)
// 工具审核
adminRoutes.get('/tools', AdminController.getTools)
adminRoutes.put('/tools/:id/approve', AdminController.approveTool)
adminRoutes.put('/tools/:id/reject', AdminController.rejectTool)
// 需求管理
adminRoutes.get('/requirements', AdminController.getRequirements)
adminRoutes.put('/requirements/:id/cancel', AdminController.cancelRequirement)
// 提现审核 - Phase 4
adminRoutes.get('/withdrawals', AdminController.getWithdrawals)
adminRoutes.put('/withdrawals/:id/approve', AdminController.approveWithdrawal)
adminRoutes.put('/withdrawals/:id/reject', AdminController.rejectWithdrawal)
// 佣金结算 - Phase 4
adminRoutes.get('/settlements', AdminController.getSettlementList)
adminRoutes.post('/settlements/process', AdminController.processBatchCommission)
// 风控事件 - Phase 4
adminRoutes.get('/risk-events', AdminController.getRiskEvents)
// 安全状态
adminRoutes.get('/security-status', RiskController.getSecurityStatus)
adminRoutes.post('/blacklist-ip', RiskController.blacklistIp)
// Phase 4: 风控管理
adminRoutes.get('/blacklist', RiskController.getBlacklist)
adminRoutes.post('/blacklist', RiskController.addToBlacklist)
adminRoutes.delete('/blacklist/:ip', RiskController.removeFromBlacklist)
adminRoutes.get('/sensitive-words', RiskController.getSensitiveWords)
adminRoutes.post('/sensitive-words', RiskController.addSensitiveWords)
adminRoutes.delete('/sensitive-words/:word', RiskController.removeSensitiveWord)
adminRoutes.get('/watchlist', RiskController.getWatchlist)
// Phase 5: Provider渠道管理
adminRoutes.get('/provider-channels', ChannelController.list)
adminRoutes.post('/provider-channels', ChannelController.create)
adminRoutes.put('/provider-channels/:id', ChannelController.update)
adminRoutes.delete('/provider-channels/:id', ChannelController.remove)
adminRoutes.post('/provider-channels/:id/test', ChannelController.test)
adminRoutes.get('/provider-health', ChannelController.health)
// 日志
adminRoutes.get('/logs', AdminController.getLogs)