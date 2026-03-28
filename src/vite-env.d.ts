/// <reference types="vite/client" />

declare module 'shapefile';

declare module 'leaflet' {
	export type LatLngBoundsExpression = any;
}

declare module 'react' {
	export type SetStateAction<S> = S | ((prevState: S) => S);
	export type Dispatch<A> = (value: A) => void;
	export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
	export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
	export function useMemo<T>(factory: () => T, deps: readonly any[]): T;
	export const StrictMode: any;
}

declare module 'react-dom/client' {
	export function createRoot(container: any): { render: (children: any) => void };
}

declare module 'react/jsx-runtime' {
	export const Fragment: any;
	export function jsx(type: any, props: any, key?: any): any;
	export function jsxs(type: any, props: any, key?: any): any;
}

declare namespace JSX {
	interface IntrinsicElements {
		[elemName: string]: any;
	}
}
