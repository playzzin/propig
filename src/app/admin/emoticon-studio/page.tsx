import EmoticonStudioPage from './studio/EmoticonStudioPage';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmoticonStudioRoute({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'development') {
    const params = await searchParams;
    if (params.preview === '1') {
      const { default: EmoticonStudioPreviewFixture } = await import(
        './studio/testing/EmoticonStudioPreviewFixture'
      );
      return <EmoticonStudioPreviewFixture />;
    }
  }

  return <EmoticonStudioPage />;
}
