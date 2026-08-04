import WordDetail from './WordDetail';

// Next.js 16 부터 params 는 Promise 입니다. 그래서 await 로 풉니다.
export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <WordDetail id={decodeURIComponent(id)} />;
}
