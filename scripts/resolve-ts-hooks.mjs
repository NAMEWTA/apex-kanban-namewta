const EXT = /\.(?:[cm]?[jt]s|json|svg|md|node)$/;

export async function resolve(specifier, context, nextResolve) {
	if (
		(specifier.startsWith('./') || specifier.startsWith('../')) &&
		!EXT.test(specifier)
	) {
		return nextResolve(`${specifier}.ts`, context);
	}
	return nextResolve(specifier, context);
}
