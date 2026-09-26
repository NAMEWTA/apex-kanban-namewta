/** Terminal text for a renderer load failure. WebGL fallback stays silent. */
export function terminalRendererNotice(error: unknown): string | null {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.toLowerCase().includes('webgl2')
		|| message.includes('加载渲染器插件失败')
		|| message.includes('Failed to load renderer addon')
	) {
		return null;
	}
	return `\r\n\x1b[1;31m[渲染器错误] ${message}\x1b[0m\r\n`;
}
