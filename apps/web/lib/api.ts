export const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
export const collabBase = process.env.NEXT_PUBLIC_COLLAB_WS_BASE ?? 'ws://localhost:3002';

export function apiUrl(path: string) {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
		return `${apiBase}/api${normalizedPath}`;
	}
	return `${apiBase}${normalizedPath}`;
}
