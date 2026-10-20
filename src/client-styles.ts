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
.satellite-ui__label { display: block; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.satellite-ui__input { box-sizing: border-box; display: block; width: 100%; min-width: 0; height: 36px; padding: 0 10px; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; }
.satellite-ui__input::placeholder { color: var(--dsw-alias-label-dimmed); }
.satellite-ui__input:disabled { opacity: .6; }
.satellite-ui__select { padding: 0 6px; }
.satellite-ui__catalog { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.satellite-ui__tabs { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 3px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); overflow-x: auto; }
.satellite-ui__tab { box-sizing: border-box; flex: none; min-height: 32px; padding: 0 12px; border: 0; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 18px; cursor: pointer; }
.satellite-ui__tab:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.satellite-ui__tab[aria-selected="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.satellite-ui__tab:disabled { opacity: .4; cursor: default; }
.satellite-ui__role { display: block; margin: 0; padding: 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; font-weight: 500; }
.satellite-ui__role-id { color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow-wrap: anywhere; }
.satellite-ui__description { margin: 0; color: var(--dsw-alias-label-secondary); max-width: 36em; overflow-wrap: anywhere; }
.satellite-ui__details { margin: 0; max-width: 36em; overflow-wrap: anywhere; }
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
.satellite-ui__card-head .satellite-ui__badge { white-space: normal; text-align: right; }
.satellite-ui__roles { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; min-width: 0; container-type: inline-size; }
.satellite-ui__role-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 14px; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); }
.satellite-ui__role-card[data-state="orphan"], .satellite-ui__role-card[data-state="unverified"] { border-color: var(--dsw-alias-border-l4); }
.satellite-ui__role-card:focus-within { border-color: var(--dsw-alias-border-l4); }
.satellite-ui__card-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; min-width: 0; }
.satellite-ui__card-identity { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; min-width: 0; }
.satellite-ui__fields, .satellite-ui__group-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px 16px; min-width: 0; }
.satellite-ui__field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.satellite-ui__field--check { gap: 4px; }
.satellite-ui__groups { display: grid; gap: 14px; min-width: 0; container-type: inline-size; }
/* fieldset 只负责分组语义：边框/底色放在 body 上，避免 legend 把上边框切出缺口。 */
.satellite-ui__group { min-width: 0; min-inline-size: 0; margin: 0; padding: 0; border: 0; background: none; }
.satellite-ui__group-body { padding: 12px 14px; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); }
.satellite-ui__group-title { display: block; margin: 0 0 6px; padding: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; font-weight: 500; }
.satellite-ui__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
/* 没有操作可放时不占位（例如目录不可用时的卡片）。 */
.satellite-ui__actions:empty { display: none; }
.satellite-ui__actions--footer { padding-top: 10px; border-top: .5px solid var(--dsw-alias-border-l2); }
.satellite-ui__button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 6px; min-height: 36px; max-width: 100%; padding: 0 12px; border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; text-decoration: none; cursor: pointer; }
.satellite-ui__button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
.satellite-ui__button:disabled { opacity: .4; cursor: default; }
.satellite-ui__button--primary { border-color: transparent; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.satellite-ui__button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.satellite-ui__button--quiet { border-color: transparent; color: var(--dsw-alias-label-tertiary); }
.satellite-ui__button:focus-visible, .satellite-ui__input:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.satellite-ui__panel { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform); min-width: 0; }
.satellite-ui__panel[data-state="unavailable"] { border: .5px dashed var(--dsw-alias-border-l3); }
.satellite-ui__panel[data-state="read-only"] { border: .5px solid var(--dsw-alias-border-l2); }
/* 双列只取决于这一节自己的宽度（container query），不看视口：宿主的设置页可能很窄。 */
@container (min-width: 560px) {
  .satellite-ui__fields, .satellite-ui__group-body { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`
