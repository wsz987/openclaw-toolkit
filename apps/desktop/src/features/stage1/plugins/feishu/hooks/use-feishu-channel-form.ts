import { useEffect, useState } from 'react';
import {
  createDefaultFeishuChannelFormState,
  createFeishuChannelFormState,
  type FeishuChannelFormState
} from '../model/feishu-channel';
import type { FeishuChannelStatus } from '../../../model/types';
type FeishuChannelFormKey = keyof FeishuChannelFormState;

export function useFeishuChannelForm(status?: FeishuChannelStatus | null) {
  const [form, setForm] = useState<FeishuChannelFormState>(() => createFeishuChannelFormState(status));
  const [secretVisibility, setSecretVisibility] = useState({
    appSecret: false,
    verificationToken: false,
    encryptKey: false
  });

  useEffect(() => {
    setForm(createFeishuChannelFormState(status));
  }, [status]);

  function updateField<K extends FeishuChannelFormKey>(key: K, value: FeishuChannelFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function reset() {
    setForm(status ? createFeishuChannelFormState(status) : createDefaultFeishuChannelFormState());
    setSecretVisibility({
      appSecret: false,
      verificationToken: false,
      encryptKey: false
    });
  }

  function toggleSecret(name: keyof typeof secretVisibility) {
    setSecretVisibility((current) => ({
      ...current,
      [name]: !current[name]
    }));
  }

  return {
    form,
    reset,
    secretVisibility,
    setForm,
    toggleSecret,
    updateField
  };
}
