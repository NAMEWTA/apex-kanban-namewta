/** Which view a terminal leaf should show after the agent module flag changes. */
export function terminalLeafKind(hostActive: boolean): 'active' | 'inactive' {
	return hostActive ? 'active' : 'inactive';
}
