// 设置页里的一节：只使用宿主主题变量，类名 BEM，状态走 data-* 属性。
// 放在客户端产物里，安装后不再需要单独的 CSS 加载步骤。
export const css = `
.satellite-ui { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; }
.satellite-ui__title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.satellite-ui__intro, .satellite-ui__notice, .satellite-ui__error { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.satellite-ui__intro { color: var(--dsw-alias-label-secondary); }
.satellite-ui__notice { color: var(--dsw-alias-label-tertiary); }
.satellite-ui__notice[data-state="missing"] { color: var(--dsw-alias-state-warn-primary); }
.satellite-ui__error { color: var(--dsw-alias-state-error-primary); }
.satellite-ui__status { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); }
.satellite-ui__status[data-state="saved"] { color: var(--dsw-alias-state-success-primary); }
.satellite-ui__status[data-state="failed"] { color: var(--dsw-alias-state-error-primary); }
.satellite-ui__status[data-state="busy"] { color: var(--dsw-alias-state-business-primary); }
.satellite-ui__table { border-collapse: collapse; width: 100%; min-width: 0; }
.satellite-ui__head { text-align: left; font-weight: 500; padding: 6px 8px 6px 0; color: var(--dsw-alias-label-secondary); border-bottom: .5px solid var(--dsw-alias-border-l2); }
.satellite-ui__cell { padding: 6px 8px 6px 0; vertical-align: middle; }
.satellite-ui__label { display: block; margin-bottom: 6px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.satellite-ui__input { box-sizing: border-box; display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; }
.satellite-ui__input::placeholder { color: var(--dsw-alias-label-dimmed); }
.satellite-ui__input:disabled { opacity: .6; }
.satellite-ui__select { padding: 0 6px; }
.satellite-ui__catalog { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.satellite-ui__role { display: block; padding: 2px 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; }
.satellite-ui__role-id { color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow-wrap: anywhere; }
.satellite-ui__description { margin: 3px 0; color: var(--dsw-alias-label-secondary); max-width: 36em; overflow-wrap: anywhere; }
.satellite-ui__details { margin-top: 4px; max-width: 36em; overflow-wrap: anywhere; }
.satellite-ui__details summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
.satellite-ui__details summary:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.satellite-ui__metadata { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 8px; margin: 5px 0; font-size: 11px; }
.satellite-ui__metadata dt { color: var(--dsw-alias-label-tertiary); }
.satellite-ui__metadata dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.satellite-ui__bindings { margin: 5px 0; padding-left: 16px; }
.satellite-ui__bindings li + li { margin-top: 8px; }
.satellite-ui__raw-model { white-space: pre-wrap; overflow-wrap: anywhere; }
.satellite-ui__badge { color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.satellite-ui__badge[data-state="declared"] { color: var(--dsw-alias-state-business-primary); }
.satellite-ui__badge[data-state="orphan"], .satellite-ui__badge[data-state="unverified"] { color: var(--dsw-alias-state-warn-primary); white-space: normal; }
.satellite-ui__badge[data-state="fixed"] { white-space: normal; }
.satellite-ui__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.satellite-ui__button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 6px; min-height: 28px; max-width: 100%; padding: 4px 10px; border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; text-decoration: none; cursor: pointer; }
.satellite-ui__button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
.satellite-ui__button:disabled { opacity: .4; cursor: default; }
.satellite-ui__button--primary { border-color: transparent; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.satellite-ui__button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.satellite-ui__button--quiet { border-color: transparent; color: var(--dsw-alias-label-tertiary); }
.satellite-ui__button:focus-visible, .satellite-ui__input:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.satellite-ui__panel { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform); min-width: 0; }
.satellite-ui__panel[data-state="unavailable"] { border: .5px dashed var(--dsw-alias-border-l3); }
.satellite-ui__panel[data-state="read-only"] { border: .5px solid var(--dsw-alias-border-l2); }
`
