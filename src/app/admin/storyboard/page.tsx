'use client';

import { useRouter } from 'next/navigation';
import StoryboardWorkspace from '@/components/image-generator/StoryboardWorkspace';
import { useImageGeneratorControls } from '@/app/admin/image-generator/hooks';

export default function StoryboardPage() {
    const router = useRouter();
    const { generateMutation, generateStoryboardScene } = useImageGeneratorControls();

    return (
        <StoryboardWorkspace
            presentation="page"
            onClose={() => router.push('/admin')}
            onGenerateScene={generateStoryboardScene}
            isGenerating={generateMutation.isPending}
        />
    );
}
