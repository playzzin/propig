'use client';

import { useRouter } from 'next/navigation';
import StoryboardWorkspace from '@/components/image-generator/StoryboardWorkspace';
import { useStoryboardImageGeneration } from '@/hooks/useStoryboardImageGeneration';

export default function StoryboardPage() {
    const router = useRouter();
    const { generateMutation, generateStoryboardScene } = useStoryboardImageGeneration();

    return (
        <StoryboardWorkspace
            presentation="page"
            onClose={() => router.push('/admin')}
            onGenerateScene={generateStoryboardScene}
            isGenerating={generateMutation.isPending}
        />
    );
}
