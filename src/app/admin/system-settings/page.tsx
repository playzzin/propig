'use client';

import React, { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import styled from 'styled-components';
import Swal from 'sweetalert2';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { useSystem } from '@/contexts/SystemContext';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';
import {
  systemSettingsFormSchema,
  type SystemSettingsFormValues,
} from '@/schemas/systemSettingsSchema';

const Container = styled.div`
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  color: var(--text-main);
`;

const Card = styled.div`
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
`;

const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-bright);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-dim);
`;

const Input = styled.input`
  width: 100%;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text-main);
  font-size: 0.9rem;
  outline: none;
  transition: all 0.2s;

  &:focus {
    border-color: var(--accent-primary);
    background: rgba(0, 0, 0, 0.3);
  }
`;

const ErrorText = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #fca5a5;
`;

const SaveButton = styled.button`
  background: var(--accent-primary, #3b82f6);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Preview = styled.div`
  margin-top: 8px;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-medium);
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

const InputRow = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;
`;

const SectionDescription = styled.p`
  color: var(--text-dim);
  font-size: 0.85rem;
  margin: 0 0 24px;
  line-height: 1.6;
`;

export default function SystemSettingsPage() {
  const { settings, updateSettings, loading } = useSystem();
  const { data: sites = {}, isLoading: isLoadingSites } = useMenuSitesQuery();

  const siteEntries = useMemo(() => getSwitchableSiteEntries(sites), [sites]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SystemSettingsFormValues>({
    resolver: zodResolver(systemSettingsFormSchema),
    defaultValues: {
      logoUrl: '',
      envLogos: {},
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (isLoadingSites) {
      return;
    }

    reset({
      logoUrl: settings.logoUrl ?? '',
      envLogos: Object.fromEntries(
        siteEntries.map(([siteId]) => [siteId, settings.envLogos?.[siteId] ?? '']),
      ),
    });
  }, [isLoadingSites, reset, settings.envLogos, settings.logoUrl, siteEntries]);

  const saveMutation = useMutation({
    mutationFn: async (values: SystemSettingsFormValues) => {
      await updateSettings({
        logoUrl: values.logoUrl,
        envLogos: values.envLogos,
      });
    },
    onSuccess: async () => {
      await Swal.fire({
        icon: 'success',
        title: '설정 저장 완료',
        text: '기본 로고와 사이트별 로고가 반영되었습니다.',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#3b82f6',
      });
    },
    onError: async (error) => {
      console.error('Failed to save settings:', error);
      await Swal.fire({
        icon: 'error',
        title: '저장 실패',
        text: '설정을 저장하는 중 오류가 발생했습니다.',
        background: '#1a1a1a',
        color: '#ffffff',
      });
    },
  });

  const watchedLogoUrl = useWatch({
    control,
    name: 'logoUrl',
  });

  const watchedEnvLogos = useWatch({
    control,
    name: 'envLogos',
  });

  const onSubmit = handleSubmit(async (values) => {
    await saveMutation.mutateAsync(values);
  });

  if (loading || isLoadingSites) {
    return <Container>로딩 중...</Container>;
  }

  return (
    <Container>
      <Title>
        <i className="fa-solid fa-gears" /> 시스템 설정
      </Title>

      <Card>
        <Title style={{ fontSize: '1.1rem' }}>
          <i className="fa-solid fa-paintbrush" /> 브랜드 및 로고 관리
        </Title>
        <SectionDescription>
          기본 로고는 공통 fallback 으로 사용되고, 사이트별 로고는 각 모드의 사이드바 상단에
          우선 적용됩니다.
        </SectionDescription>

        <Form onSubmit={onSubmit}>
          <FormGroup>
            <Label htmlFor="default-logo-url">기본 로고 URL</Label>
            <InputRow>
              <div style={{ flex: 1 }}>
                <Input
                  id="default-logo-url"
                  placeholder="https://example.com/logo-default.png"
                  {...register('logoUrl')}
                />
                {typeof errors.logoUrl?.message === 'string' ? (
                  <ErrorText>{errors.logoUrl.message}</ErrorText>
                ) : null}
              </div>
              <Preview>
                {watchedLogoUrl ? (
                  <img src={watchedLogoUrl} alt="기본 로고 미리보기" />
                ) : (
                  <i className="fa-solid fa-image" style={{ opacity: 0.3 }} />
                )}
              </Preview>
            </InputRow>
          </FormGroup>

          {siteEntries.map(([siteId, siteData]) => {
            const error = errors.envLogos?.[siteId];
            const previewUrl = watchedEnvLogos?.[siteId] ?? '';

            return (
              <FormGroup key={siteId}>
                <Label htmlFor={`env-logo-${siteId}`}>
                  {siteData.name} ({siteId}) 로고 URL
                </Label>
                <InputRow>
                  <div style={{ flex: 1 }}>
                    <Input
                      id={`env-logo-${siteId}`}
                      placeholder={`https://example.com/logo-${siteId}.png`}
                      {...register(`envLogos.${siteId}`)}
                    />
                    {typeof error?.message === 'string' ? (
                      <ErrorText>{error.message}</ErrorText>
                    ) : null}
                  </div>
                  <Preview>
                    {previewUrl ? (
                      <img src={previewUrl} alt={`${siteData.name} 로고 미리보기`} />
                    ) : (
                      <i
                        className={`fa-solid fa-${siteData.icon || 'image'}`}
                        style={{ opacity: 0.3 }}
                      />
                    )}
                  </Preview>
                </InputRow>
              </FormGroup>
            );
          })}

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton type="submit" disabled={saveMutation.isPending || !isDirty}>
              {saveMutation.isPending ? '저장 중...' : '설정 저장'}
            </SaveButton>
          </div>
        </Form>
      </Card>
    </Container>
  );
}
