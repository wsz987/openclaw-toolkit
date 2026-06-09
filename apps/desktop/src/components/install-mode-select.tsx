type InstallMode = 'local' | 'remote' | 'npm';

type Props = {
  installMode: InstallMode;
  onChange: (value: InstallMode) => void;
};

export function InstallModeSelect({ installMode, onChange }: Props) {
  return (
    <label>
      <span>安装模式</span>
      <select value={installMode} onChange={(event) => onChange(event.target.value as InstallMode)}>
        <option value="local">内置稳定版</option>
        <option value="remote">远程服务器</option>
        <option value="npm">官方 npm 下载</option>
      </select>
    </label>
  );
}
