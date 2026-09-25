/** 音乐播放小组件（服务层提示） */
export const messages = {
	en: {},
	zh: {
		'music.accountTitle': '网易云音乐账号',
		'music.accountSignedIn': '本机已有登录会话。播放权限以账号会员、购曲记录及地区版权为准。',
		'music.accountSignedOut': '尚未登录。登录后可请求播放账号有权限的会员歌曲。',
		'music.accountLogin': '手机号 / 网易云登录',
		'music.accountLogout': '退出登录',
		'music.accountSuccess': '网易云音乐账号登录成功',
		'music.accountFailed': '未能完成登录。请在桌面版 Obsidian 重试，并在网易云官方页面完成登录。',
		'music.accountLogoutFailed': '未能清除本机登录会话，请重试退出登录。',
		'music.authExpired': '网易云登录已失效，请前往设置 → 小组件 → 音乐重新登录。',
		'music.vipSkipped': '无法播放「{name}」：请登录或检查会员、购曲及地区版权权限',
		'music.unplayableSkipped': '无法播放「{name}」：会员、购曲或地区版权受限，已跳过',
		'music.networkError': '播放出错，自动跳到下一首…',
		'music.stopAfterFailures': '已停止：连续多首无法播放',
		'music.badPlaylistLink': '不是有效的网易云歌单链接或 ID',
		'music.importEmpty': '歌单为空或不可用',
	},
};
