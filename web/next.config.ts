import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// 이 폴더를 프로젝트의 뿌리로 봅니다.
	//
	// 폴더 맨 위에도 package.json 이 있어서(데이터베이스 도구용),
	// 지정하지 않으면 Next.js 가 어느 쪽이 뿌리인지 헷갈려 합니다.
	turbopack: {
		root: path.resolve(__dirname),
	},
};

export default nextConfig;
