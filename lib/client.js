window.__ModuleLoader__.load({
	id: "satellite-ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/compat.ts
		/** Supported stable Satellite releases; shared by Host and browser checks. */
		const SUPPORTED_MAIN_RANGE = ">=0.1.0 <0.2.0";
		/** Strict comparator ranges only. Invalid clauses and prereleases fail closed. */
		function satisfiesRange(version, range = SUPPORTED_MAIN_RANGE) {
			const parse = (value) => {
				if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return void 0;
				const parts = value.split("+")[0].split(".").map(Number);
				return parts.every(Number.isSafeInteger) ? parts : void 0;
			};
			const actual = parse(version);
			if (!actual || !range.trim()) return false;
			return range.trim().split(/\s+/).every((clause) => {
				const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(clause);
				const expected = match && parse(match[2]);
				if (!match || !expected) return false;
				let order = 0;
				for (let i = 0; i < 3; i++) if (actual[i] !== expected[i]) {
					order = actual[i] < expected[i] ? -1 : 1;
					break;
				}
				switch (match[1] ?? "=") {
					case ">=": return order >= 0;
					case "<=": return order <= 0;
					case ">": return order > 0;
					case "<": return order < 0;
					default: return order === 0;
				}
			});
		}
		//#endregion
		//#region src/client-styles.ts
		const css = `
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
.satellite-ui__role { display: block; min-height: 32px; padding: 6px 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; }
.satellite-ui__badge { color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.satellite-ui__badge[data-state="declared"] { color: var(--dsw-alias-state-business-primary); }
.satellite-ui__badge[data-state="added"] { color: var(--dsw-alias-state-success-primary); }
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
`;
		//#endregion
		//#region src/client-locales.ts
		/** 本页面的字典：设置页导航标签 + 页面正文文案。 */
		const en = {
			sectionLabel: "Satellite",
			title: "Role models",
			intro: "These profile-wide choices affect all projects using this profile. Only explicit overrides are saved. Clear an incomplete row or choose Follow default to inherit; declared roles cannot be removed.",
			role: "Role",
			provider: "Provider",
			model: "Model",
			origin: "Origin",
			originDeclared: "Declared",
			originOverride: "Override",
			originAdded: "Added",
			fixed: "Not removable",
			unset: "No explicit choice",
			inherited: "Inherited default",
			deploymentDefault: "Default owned by deployment; this page cannot resolve it",
			layeredRoutes: "Editing is disabled: a lower deployment layer customizes routes. Arrays replace across layers rather than merge by role, so this sparse editor cannot preserve that configuration. Edit the deployment composition instead. Any existing draft is preserved.",
			defaultsUnavailable: "Editing is disabled because the inherited routes or their code schema defaults cannot be verified. Wait for settings to reconnect, or check the functional plugin and deployment. Any existing draft is preserved.",
			compatLoading: "Checking the installed Satellite version…",
			compatFailed: "Satellite must be installed and enabled at a stable version >=0.1.0 <0.2.0. Version lookup failed or the installed version is unsupported; editing is disabled.",
			retryCompatibility: "Check compatibility again",
			inherit: "Follow default",
			duplicate: "Role names must be unique.",
			settingsLoading: "Loading settings…",
			settingsUnavailable: "Settings are currently unavailable.",
			declaredMissing: "The role declaration is missing. Check the functional plugin configuration and version; reinstalling does not reset profile overrides.",
			catalogClears: "On save, these overrides absent from the complete catalogue will be removed and inherit defaults:",
			catalogLoading: "Loading the model catalogue…",
			catalogFailed: "The model catalogue is unavailable, so provider and model are plain text fields.",
			catalogPartial: "Some providers could not be listed. Their unchanged overrides are preserved; reload the catalogue to retry.",
			retryCatalog: "Reload the catalogue",
			add: "Add role",
			remove: "Remove",
			save: "Save",
			saving: "Saving…",
			discard: "Discard changes",
			saved: "Saved.",
			failed: "Save was rejected or the settings changed elsewhere. Your draft is preserved; discard it to reload the latest values before retrying.",
			readOnly: "This deployment stores settings read-only.",
			unsupported: "The satellite plugin config is served, but it has none of the fields this page drives (routes/roles), so the installed satellite is probably outside the supported range >=0.1.0 <0.2.0.",
			pageRoles: "Roles",
			pageAndroid: "Android execution",
			tabsLabel: "Satellite settings pages",
			androidTitle: "Android execution (local)",
			androidIntro: "Local Android tools run in this session sandbox: project facts, build/test, device, emulator, journey and capture. These values are machine-specific and are saved in this profile, not in the project repository.",
			androidEnabled: "Enable local Android execution",
			androidEnabledHint: "When off, the Android tools are registered but refuse to run.",
			androidCli: "Android CLI path",
			androidPrivacy: "CLI usage-data declaration",
			androidPrivacyUnset: "Not declared (discovery stays unavailable)",
			androidPrivacyVerifiedDisabled: "Usage collection is verifiably disabled",
			androidPrivacyOptIn: "I accept the CLI usage-data notice",
			androidAdb: "adb path",
			androidEmulator: "emulator path",
			androidAvdmanager: "avdmanager path",
			androidJavaHome: "JAVA_HOME for Gradle",
			androidServerEndpoint: "adb server endpoint",
			androidTimeout: "Operation timeout (ms)",
			androidOutput: "Output limit per stream (bytes)",
			androidEffective: "Currently",
			androidOn: "enabled",
			androidOff: "disabled",
			androidEmpty: "Empty = inherit the code default",
			androidMachineHint: "Leave a field empty to inherit the code default. Paths must be absolute and are never committed to the repository.",
			androidInvalidTimeout: "Operation timeout must be an integer between 1000 and 3600000 milliseconds.",
			androidInvalidOutput: "Output limit must be an integer between 1024 and 4194304 bytes.",
			androidInvalidPrivacy: "The usage-data declaration must be one of the two listed choices.",
			androidPathWarning: "These fields are not absolute paths and will fail at runtime",
			androidUnsupported: "The satellite-android settings are served, but the installed functional plugin does not declare the execution field. Update the plugin; reinstalling does not reset profile overrides."
		};
		const zh = {
			sectionLabel: "Satellite",
			title: "角色模型",
			intro: "这里修改整个 profile，影响使用它的所有项目。只保存显式覆盖；清空或未填完整的行恢复继承默认，不会禁用角色。插件声明的角色不可删除。",
			role: "角色",
			provider: "提供方",
			model: "模型",
			origin: "来源",
			originDeclared: "插件声明",
			originOverride: "覆盖",
			originAdded: "新增",
			fixed: "不可删除",
			unset: "无显式选择",
			inherited: "继承默认",
			deploymentDefault: "默认由部署配置，页面无法解析",
			layeredRoutes: "已禁止编辑：下层部署自定义了 routes。数组跨层整段替换，不会逐角色合并，此稀疏编辑器无法无损保存。请修改部署装配；已有草稿仍保留。",
			defaultsUnavailable: "无法核验继承路由或代码 schema 默认值，已禁止编辑。请等待设置重新连接，或检查功能插件与部署；已有草稿仍保留。",
			compatLoading: "正在核对已安装的 Satellite 版本…",
			compatFailed: "需要已安装并启用的 Satellite 稳定版本 >=0.1.0 <0.2.0。无法读取版本或版本不兼容，已停止编辑。",
			retryCompatibility: "重新核对兼容性",
			inherit: "跟随默认",
			duplicate: "角色名不可重复。",
			settingsLoading: "正在加载设置…",
			settingsUnavailable: "设置当前不可用。",
			declaredMissing: "缺少角色声明，请检查功能插件配置与版本；重新安装不会重置 profile 覆盖。",
			catalogClears: "保存时将清除完整目录中不存在的这些覆盖，并恢复默认：",
			catalogLoading: "正在加载模型目录…",
			catalogFailed: "模型目录不可用，provider 与 model 已改用文本输入。",
			catalogPartial: "部分 provider 的模型没能取到；未编辑的覆盖仍会保留，可重新加载目录。",
			retryCatalog: "重新加载目录",
			add: "新增角色",
			remove: "删除",
			save: "保存",
			saving: "保存中…",
			discard: "放弃修改",
			saved: "已保存。",
			failed: "保存被拒绝，或设置已被其他操作更改。草稿已保留；可放弃修改以读取最新值，再重试。",
			readOnly: "本部署的设置为只读。",
			unsupported: "主插件的设置已被服务，但其中没有本页依赖的配置字段（routes/roles）；当前安装的 satellite 可能不在支持范围 >=0.1.0 <0.2.0 内。",
			pageRoles: "角色模型",
			pageAndroid: "Android 执行",
			tabsLabel: "Satellite 设置页",
			androidTitle: "Android 本地执行",
			androidIntro: "本地 Android 工具在本次会话沙箱里运行：项目事实、构建/测试、设备、模拟器、UI 旅程与采集。这些路径属于本机配置，保存在 profile，不会进入项目仓库。",
			androidEnabled: "启用本地 Android 执行",
			androidEnabledHint: "关闭时这些工具仍会注册，但拒绝执行。",
			androidCli: "Android CLI 路径",
			androidPrivacy: "CLI 使用统计声明",
			androidPrivacyUnset: "未声明（动态发现保持不可用）",
			androidPrivacyVerifiedDisabled: "已确认关闭使用统计",
			androidPrivacyOptIn: "我接受 CLI 的使用数据说明",
			androidAdb: "adb 路径",
			androidEmulator: "emulator 路径",
			androidAvdmanager: "avdmanager 路径",
			androidJavaHome: "Gradle 的 JAVA_HOME",
			androidServerEndpoint: "adb server 地址",
			androidTimeout: "单操作超时（毫秒）",
			androidOutput: "每流输出上限（字节）",
			androidEffective: "当前",
			androidOn: "已启用",
			androidOff: "未启用",
			androidEmpty: "留空 = 继承代码默认值",
			androidMachineHint: "留空表示继承代码默认值；路径必须是绝对路径，且不会进入仓库。",
			androidInvalidTimeout: "单操作超时必须是 1000–3600000 之间的整数毫秒。",
			androidInvalidOutput: "输出上限必须是 1024–4194304 之间的整数字节。",
			androidInvalidPrivacy: "使用统计声明必须是列出的两种取值之一。",
			androidPathWarning: "以下字段不是绝对路径，运行时必然失败",
			androidUnsupported: "satellite-android 的设置已被服务，但已安装的功能插件没有声明 execution 字段。请升级插件；重新安装不会重置 profile 覆盖。"
		};
		//#endregion
		//#region src/client.tsx
		/**
		* `satellite-ui` 的浏览器半边：在**设置页**新增一个 "Satellite 角色模型" 页面。
		*
		* 设置页插槽不提供表单，因此这里自己接设置服务：
		*   ctx.configForms.get(命名空间) → scope.getSnapshot() 读值 {status, writable, revision, value}
		*   scope.subscribe(listener) 跟随快照更新，保留原生方法 receiver
		*   scope.mutate([{ op: 'set', path: ['routes'], value }], revision) 是唯一写入口
		* （用法与官方 `ui-settings-subagent` 页面一致。）
		*
		* 表单暴露的是**易变字段的值**，因此行集合由两个字段决定：
		*   declaredRoles: string[]                        —— 插件声明的角色：固定行，不提供删除控件
		*   routes: {role, provider, model}[]              —— 每个角色的生效 provider/model
		* routes 里出现但不在 declaredRoles 里的角色、以及本次新增的行可删；保存只写 routes。
		*
		* 设置快照的 `value` 里**没有** `declaredRoles` 这个键时（例如 profile 里存着升级前的行配置
		* 快照、新字段还没生效），页面给一句明确说明，而不是静默画一张空表；有该键时才按声明的
		* 角色渲染固定行。
		*
		* provider/model 的候选来自宿主的实时模型目录 `remote.session.modelCatalog()`：
		*   成功 → response.value.groups（分组） / response.value.failures（部分 provider 取不到）
		*   失败 → response.ok === false
		* 目录不可用（服务缺失、抛错、空目录）时降级为文本输入；下拉的选项**只来自目录**，外加一个
		* "未配置"空选项：目录里查不到的当前值一律按未配置显示，不再塞回选项里做保底。
		*
		* 命名空间为 Loader entry id；base/user 区分继承默认与显式覆盖。
		* 保存只写覆盖；空行恢复继承，且保留未编辑路由的高级字段。
		*
		* **挂载门控**：整节只在宿主确实服务 `satellite-node` 这个设置命名空间时注册
		* （`configForms.whileServed`，官方设置页同款用法）。功能插件 `satellite` 未安装、未激活或
		* 已停用 `satellite-node` 行时，宿主不服务该命名空间，设置页里就不会有 Satellite 这一节
		* ——没有服务就不提供界面，而不是挂上去显示"没找到设置项"。
		*/
		const name = "satellite-ui/client";
		/**
		* 硬依赖。`remote` 是目录提供方：本页的 provider/model 下拉要用它，因此**进 inject**，
		* 与官方设置页（`ui-settings-subagent` 的 `['slots','locale','remote','remote.session','configForms']`）
		* 同一原则——目录只有调用级失败时才降级为文本输入，服务本身缺失时不该退化成文本输入。
		*/
		const inject = [
			"slots",
			"locale",
			"configForms",
			"settingsSchema",
			"remote",
			"remote.session",
			"remote.pluginManager"
		];
		/** 本页面的字典命名空间，也是设置页条目的 locale。 */
		const NS = "satellite-ui";
		/** 设置页里这一节的 id 与位置。 */
		const SECTION_ID = "satellite";
		const SECTION_ORDER = 30;
		/** 本页依赖的设置命名空间：主插件 `satellite-node` 行的 Loader 条目 id。 */
		const SETTINGS_NS = "satellite-node";
		/** Android 执行配置所在的设置命名空间：`satellite/android` 行的 Loader 条目 id。 */
		const ANDROID_NS = "satellite-android";
		/** 该行的配置里是否存在本页依赖的字段面。 */
		function hasRouteSurface(values) {
			if (values === null || typeof values !== "object") return false;
			return "routes" in values || "roles" in values || "declaredRoles" in values;
		}
		function routeEntries(values) {
			return (Array.isArray(values.routes) ? values.routes : []).filter((entry) => entry !== null && typeof entry === "object" && typeof entry.role === "string" && typeof entry.provider === "string" && typeof entry.model === "string").map((entry) => ({ ...entry }));
		}
		function declaredRoleNames(values) {
			const raw = values.declaredRoles;
			const names = (Array.isArray(raw) ? raw : []).filter((entry) => typeof entry === "string" && entry.trim() !== "");
			return [...new Set(names)];
		}
		/** 行顺序：插件声明的角色在前，其余（routes / 行配置里出现的）按出现次序追加。 */
		function roleNames(values) {
			const declared = declaredRoleNames(values);
			const seen = new Set(declared);
			const rest = [];
			for (const role of [...routeEntries(values).map((entry) => entry.role), ...Object.keys(values.roles ?? {})]) {
				if (seen.has(role)) continue;
				seen.add(role);
				rest.push(role);
			}
			return [...declared, ...rest];
		}
		/**
		* Profile overrides are sparse. Missing roles display the inherited schema defaults.
		* Ordinary role configuration is not exposed as editable settings.
		*/
		function initialRows(snapshot) {
			const values = snapshot.value ?? {};
			const base = snapshot.base ?? {};
			const overrides = routeEntries(snapshot.user ?? {});
			const inherited = routeEntries(base);
			const declared = new Set(declaredRoleNames(base).concat(declaredRoleNames(values)));
			return [.../* @__PURE__ */ new Set([
				...declared,
				...roleNames(base),
				...roleNames(values)
			])].map((role) => {
				const original = overrides.find((entry) => entry.role === role);
				const route = original ?? inherited.find((entry) => entry.role === role);
				return {
					role,
					provider: route?.provider ?? "",
					model: route?.model ?? "",
					declared: declared.has(role),
					added: false,
					explicit: original !== void 0,
					original
				};
			});
		}
		/**
		* 把行规范到目录内：provider 不在目录里（或未选）时该行 provider/model 都算未配置；
		* provider 有效但 model 不在它名下时只清 model。值本来就在目录里时原样返回（保持引用，
		* 草稿不会因此被无谓地新建）。目录不可用（降级为文本输入）时调用方不调它——
		* 那时选项不是目录，没有"目录内"这回事。
		*/
		function normalizeRows(rows, groups) {
			return rows.map((row) => {
				const group = groups.find((entry) => entry.id === row.provider);
				if (group === void 0) return row.provider === "" && row.model === "" ? row : {
					...row,
					provider: "",
					model: ""
				};
				if (row.model !== "" && !group.models.some((model) => model.id === row.model)) return {
					...row,
					model: ""
				};
				return row;
			});
		}
		/** Compare complete JSON route records; object keys and role ordering are not semantic. */
		function routeFingerprint(value) {
			if (!Array.isArray(value)) return void 0;
			const roles = /* @__PURE__ */ new Set();
			for (const route of value) {
				if (!route || typeof route !== "object" || Array.isArray(route) || ![
					"role",
					"provider",
					"model"
				].every((key) => typeof route[key] === "string" && route[key].trim())) return void 0;
				if (roles.has(route.role)) return void 0;
				roles.add(route.role);
			}
			const canonical = (entry) => {
				if (entry === null || typeof entry === "string" || typeof entry === "boolean") return entry;
				if (typeof entry === "number" && Number.isFinite(entry)) return entry;
				if (Array.isArray(entry)) return entry.map(canonical);
				if (typeof entry === "object" && entry !== null) return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
				throw new Error("Expected JSON route metadata");
			};
			try {
				return JSON.stringify([...value].sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0).map(canonical));
			} catch {
				return;
			}
		}
		/** Native ConfigForms owns subscription and serialization. Preserve method receivers. */
		function createSurface(ctx) {
			const scope = () => ctx.configForms.get(SETTINGS_NS);
			const read = () => {
				const snapshot = scope().getSnapshot();
				let inheritance = "unavailable";
				try {
					const descriptor = ctx.configForms.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === SETTINGS_NS);
					const schema = ctx.get("settingsSchema");
					if (descriptor && schema && descriptor.revision === snapshot.revision) {
						const node = schema.nodeAtPath(schema.rehydrate(descriptor.schema), ["routes"]);
						const defaults = node?.type === "array" ? routeFingerprint(node.meta.default) : void 0;
						const inherited = routeFingerprint(snapshot.base?.routes);
						if (defaults !== void 0 && inherited !== void 0) inheritance = defaults === inherited ? "supported" : "different";
					}
				} catch {}
				return {
					namespace: SETTINGS_NS,
					snapshot,
					inheritance
				};
			};
			return {
				async compatible() {
					const manager = ctx.get("remote.pluginManager");
					if (!manager) return false;
					const response = await manager.listBundles();
					const main = response.ok ? response.value?.find((entry) => entry.name === "satellite") : void 0;
					return main?.installed === true && main.enabled === true && satisfiesRange(main.version);
				},
				read,
				subscribe(listener) {
					const offForm = scope().subscribe(listener);
					const offSchema = ctx.configForms.describe().subscribe(listener);
					return () => {
						offForm();
						offSchema();
					};
				},
				async mutate(value, revision) {
					if (read().inheritance !== "supported") return false;
					return scope().mutate(value.length ? [{
						op: "set",
						path: ["routes"],
						value
					}] : [{
						op: "unset",
						path: ["routes"]
					}], revision);
				}
			};
		}
		/** 目录响应里的一组 provider：形状不符的条目被丢弃，而不是让整页失败。 */
		function normalizeGroups(raw) {
			if (!Array.isArray(raw)) return [];
			return raw.flatMap((group) => {
				if (group === null || typeof group !== "object") return [];
				const id = group.id;
				if (typeof id !== "string" || id === "") return [];
				const groupName = group.name;
				const rawModels = group.models;
				const models = (Array.isArray(rawModels) ? rawModels : []).flatMap((model) => {
					if (model === null || typeof model !== "object") return [];
					const modelId = model.id;
					if (typeof modelId !== "string" || modelId === "") return [];
					const modelName = model.name;
					return [{
						id: modelId,
						name: typeof modelName === "string" && modelName !== "" ? modelName : modelId
					}];
				});
				return [{
					id,
					name: typeof groupName === "string" && groupName !== "" ? groupName : id,
					models
				}];
			});
		}
		/**
		* 用给定的 ctx 建一个目录读取面。
		*
		* `remote` 服务或 `remote.session.modelCatalog` 方法不存在、抛错、返回形状不符，
		* 以及目录里一个 provider 都没有时，都返回 `{status:'error'}`，调用方据此降级为
		* 文本输入——空目录的 `<select>` 会让人无法录入新值，所以也算不可用。
		*/
		function createCatalog(ctx) {
			return { async load() {
				try {
					const nested = ctx.get("remote")?.session;
					const session = ctx.get("remote.session") ?? nested;
					const call = session?.modelCatalog;
					if (typeof call !== "function") return { status: "error" };
					const response = await call.call(session);
					if (response === null || typeof response !== "object" || response.ok !== true) return { status: "error" };
					const groups = normalizeGroups(response.value?.groups);
					if (groups.length === 0) return { status: "error" };
					const failures = response.value?.failures;
					return {
						status: "ready",
						groups,
						partial: Array.isArray(failures) && failures.length > 0
					};
				} catch {
					return { status: "error" };
				}
			} };
		}
		function selectOptions(known, none) {
			const seen = /* @__PURE__ */ new Set([""]);
			const options = [{
				value: "",
				label: none
			}];
			for (const entry of known) {
				if (seen.has(entry.value)) continue;
				seen.add(entry.value);
				options.push({
					value: entry.value,
					label: entry.label
				});
			}
			return options;
		}
		function SatelliteRoutesSection(props) {
			const { t, surface, catalog } = props;
			const [reading, setReading] = (0, react.useState)(() => {
				try {
					return surface.read();
				} catch {
					return;
				}
			});
			const [draft, setDraft] = (0, react.useState)();
			const draftRevision = (0, react.useRef)(void 0);
			const [state, setState] = (0, react.useState)("idle");
			const [models, setModels] = (0, react.useState)({ status: "loading" });
			const [catalogAgain, setCatalogAgain] = (0, react.useState)(0);
			const [compatible, setCompatible] = (0, react.useState)();
			const [compatAgain, setCompatAgain] = (0, react.useState)(0);
			const mounted = (0, react.useRef)(false);
			const acting = (0, react.useRef)(false);
			const fresh = (0, react.useId)();
			const served = reading !== void 0;
			(0, react.useEffect)(() => {
				mounted.current = true;
				const sync = () => {
					if (!mounted.current) return;
					try {
						setReading(surface.read());
					} catch {
						setReading(void 0);
					}
				};
				sync();
				const unsubscribe = surface.subscribe(sync);
				return () => {
					mounted.current = false;
					unsubscribe();
				};
			}, [surface]);
			(0, react.useEffect)(() => {
				if (!served) return void 0;
				let live = true;
				catalog.load().then((next) => {
					if (live) setModels(next);
				}, () => {
					if (live) setModels({ status: "error" });
				});
				return () => {
					live = false;
				};
			}, [
				catalog,
				served,
				catalogAgain
			]);
			(0, react.useEffect)(() => {
				let live = true;
				setCompatible(void 0);
				surface.compatible().then((ok) => {
					if (live) setCompatible(ok);
				}, () => {
					if (live) setCompatible(false);
				});
				return () => {
					live = false;
				};
			}, [
				surface,
				reading?.snapshot.revision,
				compatAgain
			]);
			const write = (0, react.useCallback)(async (value, revision) => {
				if (acting.current) return;
				acting.current = true;
				setState("busy");
				try {
					if (!await surface.compatible().catch(() => false)) {
						if (mounted.current) setCompatible(false);
						throw new Error("Unsupported Satellite version");
					}
					if (!await surface.mutate(value, revision)) throw new Error("Settings write refused");
					if (mounted.current) {
						setDraft(void 0);
						draftRevision.current = void 0;
						setState("saved");
					}
				} catch {
					if (mounted.current) setState("failed");
				} finally {
					acting.current = false;
					if (mounted.current) setReading(surface.read());
				}
			}, [surface]);
			const snapshot = reading?.snapshot;
			const values = snapshot?.value ?? {};
			const busy = state === "busy";
			const groups = models.status === "ready" ? models.groups : [];
			const selectable = models.status !== "error";
			const baseRows = draft ?? initialRows(snapshot ?? {});
			const rows = models.status === "ready" ? normalizeRows(baseRows, groups) : baseRows;
			const declaresRoles = "declaredRoles" in values;
			const modelIds = (provider) => (groups.find((group) => group.id === provider)?.models ?? []).map((model) => model.id);
			const edit = (next) => {
				if (draft === void 0) draftRevision.current = snapshot?.revision;
				setDraft(next);
				if (state !== "idle") setState("idle");
			};
			const update = (index, field, value) => edit(baseRows.map((row, i) => {
				if (i !== index) return row;
				if (field !== "provider") return {
					...row,
					[field]: value,
					explicit: true
				};
				const kept = row.model !== "" && modelIds(value).includes(row.model);
				return {
					...row,
					provider: value,
					model: kept ? row.model : "",
					explicit: true
				};
			}));
			const add = () => edit([...baseRows, {
				role: "",
				provider: "",
				model: "",
				declared: false,
				added: true,
				explicit: true
			}]);
			const remove = (index) => edit(baseRows.filter((_, i) => i !== index));
			const discard = () => {
				setDraft(void 0);
				draftRevision.current = void 0;
				setState("idle");
			};
			const roleKeys = baseRows.map((row) => row.role.trim()).filter(Boolean);
			const duplicate = new Set(roleKeys).size !== roleKeys.length;
			const payloadRows = models.status === "ready" && !models.partial ? normalizeRows(baseRows, groups) : baseRows;
			const clearedRoles = baseRows.filter((row, index) => row.explicit && row.provider && row.model && (!payloadRows[index]?.provider || !payloadRows[index]?.model)).map((row) => row.role);
			const payload = () => payloadRows.filter((row) => row.explicit && row.role.trim() && row.provider.trim() && row.model.trim()).map(({ original, role, provider, model }) => ({
				...original,
				role: role.trim(),
				provider: provider.trim(),
				model: model.trim()
			}));
			const reset = (index) => edit(baseRows.map((row, i) => {
				if (i !== index) return row;
				const inherited = routeEntries(snapshot?.base ?? {}).find((entry) => entry.role === row.role);
				return {
					...row,
					provider: inherited?.provider ?? "",
					model: inherited?.model ?? "",
					explicit: false,
					original: void 0
				};
			}));
			const none = t("unset");
			const providerOptions = () => selectOptions(groups.map((group) => ({
				value: group.id,
				label: group.name
			})), none);
			const modelOptions = (row) => selectOptions((groups.find((group) => group.id === row.provider)?.models ?? []).map((model) => ({
				value: model.id,
				label: model.name
			})), none);
			const header = [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "satellite-ui__title",
				children: t("title")
			}, "title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "satellite-ui__intro",
				children: t("intro")
			}, "intro")];
			const panel = (state, message, variant) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [header, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "satellite-ui__panel",
					"data-state": state,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: variant,
						children: message
					})
				})]
			});
			if (snapshot?.status === "loading") return panel("loading", t("settingsLoading"), "satellite-ui__notice");
			if (reading === void 0 || snapshot?.status !== "ready") return panel("unavailable", t("settingsUnavailable"), "satellite-ui__notice");
			if (!hasRouteSurface(values) || snapshot.base === void 0) return panel("unavailable", t("unsupported"), "satellite-ui__notice");
			if (reading.inheritance !== "supported") return panel("unsupported-inheritance", t(reading.inheritance === "different" ? "layeredRoutes" : "defaultsUnavailable"), "satellite-ui__error");
			if (compatible === void 0) return panel("loading", t("compatLoading"), "satellite-ui__notice");
			if (!compatible) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [
					header,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("compatFailed")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setCompatAgain((value) => value + 1),
						children: t("retryCompatibility")
					})
				]
			});
			if (snapshot?.writable === false) return panel("read-only", t("readOnly"), "satellite-ui__notice");
			const status = state === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "saved",
				role: "status",
				children: t("saved")
			}) : state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "failed",
				role: "alert",
				children: t("failed")
			}) : state === "busy" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "busy",
				role: "status",
				children: t("saving")
			}) : null;
			const catalogNotice = models.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__notice",
				role: "status",
				children: t("catalogLoading")
			}) : models.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__notice satellite-ui__error",
				role: "status",
				children: t("catalogFailed")
			}) : models.partial ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__notice",
				role: "status",
				children: t("catalogPartial")
			}) : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [
					header,
					declaresRoles ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "satellite-ui__notice",
						"data-state": "missing",
						role: "status",
						children: t("declaredMissing")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "satellite-ui__catalog",
						"data-state": models.status,
						children: [
							catalogNotice,
							clearedRoles.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								role: "status",
								children: [
									t("catalogClears"),
									" ",
									clearedRoles.join(", ")
								]
							}) : null,
							models.status === "error" || models.status === "ready" && models.partial ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button",
								type: "button",
								disabled: busy,
								onClick: () => {
									setModels({ status: "loading" });
									setCatalogAgain((count) => count + 1);
								},
								children: t("retryCatalog")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						className: "satellite-ui__table",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "satellite-ui__head",
								scope: "col",
								children: t("role")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "satellite-ui__head",
								scope: "col",
								children: t("provider")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "satellite-ui__head",
								scope: "col",
								children: t("model")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "satellite-ui__head",
								scope: "col",
								children: t("origin")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "satellite-ui__head",
								scope: "col",
								children: t("remove")
							})
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((row, index) => {
							const field = (name) => `${fresh}-${index}-${name}`;
							const providers = providerOptions();
							const modelsForRow = modelOptions(row);
							const origin = row.declared ? "declared" : row.added ? "added" : "override";
							const originLabel = row.declared ? t("originDeclared") : row.added ? t("originAdded") : t("originOverride");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								"data-state": origin,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "satellite-ui__cell",
										children: row.declared ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "satellite-ui__role",
											children: row.role
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: "satellite-ui__label",
											htmlFor: field("role"),
											children: t("role")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "satellite-ui__input",
											id: field("role"),
											value: row.role,
											placeholder: t("role"),
											spellCheck: false,
											autoComplete: "off",
											disabled: busy,
											onChange: (event) => update(index, "role", event.target.value)
										})] })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
										className: "satellite-ui__cell",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: "satellite-ui__label",
											htmlFor: field("provider"),
											children: t("provider")
										}), selectable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											className: "satellite-ui__input satellite-ui__select",
											id: field("provider"),
											value: row.provider,
											disabled: busy || models.status === "loading",
											onChange: (event) => update(index, "provider", event.target.value),
											children: providers.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: option.value,
												children: option.label
											}, option.value))
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "satellite-ui__input",
											id: field("provider"),
											value: row.provider,
											placeholder: "deepseek-official",
											spellCheck: false,
											autoComplete: "off",
											disabled: busy,
											onChange: (event) => update(index, "provider", event.target.value)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
										className: "satellite-ui__cell",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: "satellite-ui__label",
											htmlFor: field("model"),
											children: t("model")
										}), selectable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											className: "satellite-ui__input satellite-ui__select",
											id: field("model"),
											value: row.model,
											disabled: busy || models.status === "loading",
											onChange: (event) => update(index, "model", event.target.value),
											children: modelsForRow.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: option.value,
												children: option.label
											}, option.value))
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "satellite-ui__input",
											id: field("model"),
											value: row.model,
											placeholder: "deepseek-flash",
											spellCheck: false,
											autoComplete: "off",
											disabled: busy,
											onChange: (event) => update(index, "model", event.target.value)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
										className: "satellite-ui__cell",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "satellite-ui__badge",
											"data-state": origin,
											children: [
												originLabel,
												" · ",
												row.explicit ? t("originOverride") : routeEntries(snapshot.base ?? {}).some((entry) => entry.role === row.role) ? t("inherited") : t("deploymentDefault")
											]
										}), row.explicit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "satellite-ui__button",
											type: "button",
											disabled: busy,
											onClick: () => reset(index),
											children: t("inherit")
										}) : null]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: "satellite-ui__cell",
										children: row.declared ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "satellite-ui__badge",
											"data-state": "fixed",
											children: t("fixed")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "satellite-ui__button satellite-ui__button--quiet",
											type: "button",
											disabled: busy,
											"aria-label": `${t("remove")} ${row.role || index + 1}`,
											onClick: () => remove(index),
											children: t("remove")
										})
									})
								]
							}, index);
						}) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "satellite-ui__actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button satellite-ui__button--primary",
								type: "button",
								disabled: busy || duplicate || snapshot?.writable !== true || models.status === "loading",
								onClick: () => {
									if (!duplicate) write(payload(), draft === void 0 ? snapshot?.revision : draftRevision.current);
								},
								children: busy ? t("saving") : t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button",
								type: "button",
								disabled: busy,
								onClick: add,
								children: t("add")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button",
								type: "button",
								disabled: busy || draft === void 0,
								onClick: discard,
								children: t("discard")
							}),
							duplicate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "alert",
								children: t("duplicate")
							}) : null,
							status
						]
					})
				]
			});
		}
		/** 非空时必须写成绝对路径的字段；`serverEndpoint`/`privacy` 不是路径。 */
		const PATH_FIELDS = [
			"androidCli",
			"adbPath",
			"emulatorPath",
			"avdmanagerPath",
			"javaHome"
		];
		/** 数字字段的允许区间，与功能包 `resolveExecutionConfig` 的收窄保持一致。 */
		const NUMBER_FIELDS = {
			operationTimeoutMs: [1e3, 36e5],
			outputMaxBytes: [1024, 4194304]
		};
		const PRIVACY_VALUES = ["verified-disabled", "explicit-user-opt-in"];
		/**
		* 功能包里的代码默认值。`schema` 元数据可用时优先用 schema 的默认值；
		* 这里只是兜底，保证"等于默认值就 unset"这条稀疏写规则仍然成立。
		*/
		const EXECUTION_DEFAULTS = {
			enabled: false,
			operationTimeoutMs: 6e5,
			outputMaxBytes: 262144
		};
		/** `execution` 在快照里可能是 volatile 句柄 `{get}`，也可能是普通对象。 */
		function readExecution(container) {
			if (container === null || typeof container !== "object") return {};
			const raw = container.execution;
			const getter = raw !== null && typeof raw === "object" ? raw.get : void 0;
			const live = typeof getter === "function" ? getter.call(raw) : raw;
			if (live === null || typeof live !== "object" || Array.isArray(live)) return {};
			return { ...live };
		}
		function fieldText(value) {
			return typeof value === "string" ? value : "";
		}
		function executionDraft(values) {
			const number = (field) => typeof values[field] === "number" && Number.isFinite(values[field]) ? String(values[field]) : "";
			return {
				enabled: values.enabled === true,
				androidCli: fieldText(values.androidCli),
				privacy: fieldText(values.privacy),
				adbPath: fieldText(values.adbPath),
				emulatorPath: fieldText(values.emulatorPath),
				avdmanagerPath: fieldText(values.avdmanagerPath),
				javaHome: fieldText(values.javaHome),
				serverEndpoint: fieldText(values.serverEndpoint),
				operationTimeoutMs: number("operationTimeoutMs"),
				outputMaxBytes: number("outputMaxBytes")
			};
		}
		/** 一格的默认值：优先 schema 元数据，其次功能包的代码默认。 */
		function fieldDefault(field, defaults) {
			if (Object.hasOwn(defaults, field)) return defaults[field];
			return EXECUTION_DEFAULTS[field];
		}
		/**
		* 把草稿折算成稀疏的 set/unset 操作。
		*
		* 只写**与默认不同**的值：等于默认就 unset（profile 保持稀疏，插件升级后的新默认值仍然生效）。
		* 字符串清空、数字清空都表示 unset。非法数字/非法 privacy 直接拒绝，不发写请求。
		*/
		function planExecution(draft, user, defaults) {
			const ops = [];
			const path = (field) => ["execution", field];
			const unsetIfPresent = (field) => {
				if (Object.hasOwn(user, field)) ops.push({
					op: "unset",
					path: path(field)
				});
			};
			const same = (field, desired) => Object.hasOwn(user, field) && user[field] === desired;
			const enabled = draft.enabled === true;
			if (enabled === (fieldDefault("enabled", defaults) === true)) unsetIfPresent("enabled");
			else if (!same("enabled", enabled)) ops.push({
				op: "set",
				path: path("enabled"),
				value: enabled
			});
			const privacy = String(draft.privacy).trim();
			if (privacy === "") unsetIfPresent("privacy");
			else if (!PRIVACY_VALUES.includes(privacy)) return {
				ops,
				error: "privacy"
			};
			else if (!same("privacy", privacy)) ops.push({
				op: "set",
				path: path("privacy"),
				value: privacy
			});
			for (const field of [
				"androidCli",
				"adbPath",
				"emulatorPath",
				"avdmanagerPath",
				"javaHome",
				"serverEndpoint"
			]) {
				const value = String(draft[field]).trim();
				if (value === "") unsetIfPresent(field);
				else if (!same(field, value)) ops.push({
					op: "set",
					path: path(field),
					value
				});
			}
			for (const field of ["operationTimeoutMs", "outputMaxBytes"]) {
				const raw = String(draft[field]).trim();
				if (raw === "") {
					unsetIfPresent(field);
					continue;
				}
				const [min, max] = NUMBER_FIELDS[field];
				if (!/^\d+$/u.test(raw)) return {
					ops,
					error: field === "operationTimeoutMs" ? "timeout" : "output"
				};
				const value = Number(raw);
				if (!Number.isSafeInteger(value) || value < min || value > max) return {
					ops,
					error: field === "operationTimeoutMs" ? "timeout" : "output"
				};
				if (value === fieldDefault(field, defaults)) unsetIfPresent(field);
				else if (!same(field, value)) ops.push({
					op: "set",
					path: path(field),
					value
				});
			}
			return { ops };
		}
		/** 非空但不是绝对路径的字段（只提示，不阻止保存：后端会在调用时明确失败）。 */
		function pathWarnings(draft) {
			return PATH_FIELDS.filter((field) => {
				const value = String(draft[field]).trim();
				return value !== "" && !value.startsWith("/");
			});
		}
		/** 已安装 bundle 的版本门，两节共用。 */
		async function bundleCompatible(ctx) {
			const manager = ctx.get("remote.pluginManager");
			if (!manager) return false;
			const response = await manager.listBundles();
			const main = response.ok ? response.value?.find((entry) => entry.name === "satellite") : void 0;
			return main?.installed === true && main.enabled === true && satisfiesRange(main.version);
		}
		function createAndroidSurface(ctx) {
			const scope = () => ctx.configForms.get(ANDROID_NS);
			const read = () => {
				const snapshot = scope().getSnapshot();
				let declaresExecution = false;
				try {
					const descriptor = ctx.configForms.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === ANDROID_NS);
					const schema = ctx.get("settingsSchema");
					if (descriptor && schema && descriptor.revision === snapshot.revision) declaresExecution = schema.nodeAtPath(schema.rehydrate(descriptor.schema), ["execution"]) !== void 0;
				} catch {}
				return {
					snapshot,
					inherited: readExecution(snapshot.base),
					user: readExecution(snapshot.user),
					effective: readExecution(snapshot.value),
					declaresExecution
				};
			};
			return {
				compatible: () => bundleCompatible(ctx),
				read,
				subscribe(listener) {
					const offForm = scope().subscribe(listener);
					const offSchema = ctx.configForms.describe().subscribe(listener);
					return () => {
						offForm();
						offSchema();
					};
				},
				async mutate(ops, revision) {
					if (read().snapshot.status !== "ready") return false;
					return scope().mutate(ops, revision);
				}
			};
		}
		function AndroidExecutionSection(props) {
			const { t, surface } = props;
			const [reading, setReading] = (0, react.useState)(() => {
				try {
					return surface.read();
				} catch {
					return;
				}
			});
			const [draft, setDraft] = (0, react.useState)();
			const draftRevision = (0, react.useRef)(void 0);
			const [state, setState] = (0, react.useState)("idle");
			const [compatible, setCompatible] = (0, react.useState)();
			const [compatAgain, setCompatAgain] = (0, react.useState)(0);
			const mounted = (0, react.useRef)(false);
			const acting = (0, react.useRef)(false);
			const fresh = (0, react.useId)();
			const served = reading !== void 0;
			(0, react.useEffect)(() => {
				mounted.current = true;
				const sync = () => {
					if (!mounted.current) return;
					try {
						setReading(surface.read());
					} catch {
						setReading(void 0);
					}
				};
				sync();
				const unsubscribe = surface.subscribe(sync);
				return () => {
					mounted.current = false;
					unsubscribe();
				};
			}, [surface]);
			(0, react.useEffect)(() => {
				let live = true;
				setCompatible(void 0);
				surface.compatible().then((ok) => {
					if (live) setCompatible(ok);
				}, () => {
					if (live) setCompatible(false);
				});
				return () => {
					live = false;
				};
			}, [
				surface,
				reading?.snapshot.revision,
				compatAgain
			]);
			const write = (0, react.useCallback)(async (ops, revision) => {
				if (acting.current) return;
				acting.current = true;
				setState("busy");
				try {
					if (!await surface.compatible().catch(() => false)) {
						if (mounted.current) setCompatible(false);
						throw new Error("Unsupported Satellite version");
					}
					if (!await surface.mutate(ops, revision)) throw new Error("Settings write refused");
					if (mounted.current) {
						setDraft(void 0);
						draftRevision.current = void 0;
						setState("saved");
					}
				} catch {
					if (mounted.current) setState("failed");
				} finally {
					acting.current = false;
					if (mounted.current) setReading(surface.read());
				}
			}, [surface]);
			const snapshot = reading?.snapshot;
			const busy = state === "busy";
			const user = reading?.user ?? {};
			const defaults = reading?.inherited ?? {};
			const saved = executionDraft(reading?.effective ?? {});
			const current = draft ?? saved;
			const plan = planExecution(current, user, defaults);
			const warnings = pathWarnings(current);
			const changed = plan.ops.length > 0;
			const edit = (field, value) => {
				if (draft === void 0) draftRevision.current = snapshot?.revision;
				setDraft({
					...current,
					[field]: value
				});
				if (state !== "idle") setState("idle");
			};
			const discard = () => {
				setDraft(void 0);
				draftRevision.current = void 0;
				setState("idle");
			};
			const header = [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "satellite-ui__title",
				children: t("androidTitle")
			}, "title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "satellite-ui__intro",
				children: t("androidIntro")
			}, "intro")];
			const panel = (stateName, message, variant) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [header, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "satellite-ui__panel",
					"data-state": stateName,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: variant,
						children: message
					})
				})]
			});
			if (!served) return panel("unavailable", t("settingsUnavailable"), "satellite-ui__notice");
			if (snapshot?.status === "loading") return panel("loading", t("settingsLoading"), "satellite-ui__notice");
			if (snapshot?.status !== "ready") return panel("unavailable", t("settingsUnavailable"), "satellite-ui__notice");
			if (reading.declaresExecution !== true) return panel("unsupported", t("androidUnsupported"), "satellite-ui__notice");
			if (compatible === void 0) return panel("loading", t("compatLoading"), "satellite-ui__notice");
			if (!compatible) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [
					header,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("compatFailed")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setCompatAgain((value) => value + 1),
						children: t("retryCompatibility")
					})
				]
			});
			if (snapshot.writable !== true) return panel("read-only", t("readOnly"), "satellite-ui__notice");
			const error = plan.error === "timeout" ? t("androidInvalidTimeout") : plan.error === "output" ? t("androidInvalidOutput") : plan.error === "privacy" ? t("androidInvalidPrivacy") : void 0;
			const status = state === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "saved",
				role: "status",
				children: t("saved")
			}) : state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "failed",
				role: "alert",
				children: t("failed")
			}) : state === "busy" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "satellite-ui__status",
				"data-state": "busy",
				role: "status",
				children: t("saving")
			}) : null;
			const fieldId = (field) => `${fresh}-${field}`;
			const textInput = (field, labelKey) => [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				className: "satellite-ui__label",
				htmlFor: fieldId(field),
				children: t(labelKey)
			}, `${field}-label`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: "satellite-ui__input",
				id: fieldId(field),
				"data-field": field,
				value: String(current[field]),
				spellCheck: false,
				autoComplete: "off",
				placeholder: t("androidEmpty"),
				disabled: busy,
				onChange: (event) => edit(field, event.target.value)
			}, `${field}-input`)];
			const numberInput = (field, labelKey) => [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				className: "satellite-ui__label",
				htmlFor: fieldId(field),
				children: t(labelKey)
			}, `${field}-label`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: "satellite-ui__input",
				id: fieldId(field),
				"data-field": field,
				inputMode: "numeric",
				value: String(current[field]),
				spellCheck: false,
				autoComplete: "off",
				placeholder: `${NUMBER_FIELDS[field][0]}–${NUMBER_FIELDS[field][1]}`,
				disabled: busy,
				onChange: (event) => edit(field, event.target.value)
			}, `${field}-input`)];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [
					header,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "satellite-ui__catalog",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "satellite-ui__label",
							htmlFor: fieldId("enabled"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: fieldId("enabled"),
									"data-field": "enabled",
									type: "checkbox",
									checked: current.enabled === true,
									disabled: busy,
									onChange: (event) => edit("enabled", event.target.checked)
								}),
								" ",
								t("androidEnabled")
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "satellite-ui__notice",
							children: t("androidEnabledHint")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("table", {
						className: "satellite-ui__table",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tbody", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
									className: "satellite-ui__cell",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "satellite-ui__label",
										htmlFor: fieldId("privacy"),
										children: t("androidPrivacy")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "satellite-ui__input satellite-ui__select",
										id: fieldId("privacy"),
										"data-field": "privacy",
										value: String(current.privacy),
										disabled: busy,
										onChange: (event) => edit("privacy", event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("androidPrivacyUnset")
										}), PRIVACY_VALUES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value,
											children: t(value === "verified-disabled" ? "androidPrivacyVerifiedDisabled" : "androidPrivacyOptIn")
										}, value))]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("androidCli", "androidCli")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("adbPath", "androidAdb")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("emulatorPath", "androidEmulator")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("avdmanagerPath", "androidAvdmanager")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("javaHome", "androidJavaHome")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: textInput("serverEndpoint", "androidServerEndpoint")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: numberInput("operationTimeoutMs", "androidTimeout")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
								className: "satellite-ui__row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: numberInput("outputMaxBytes", "androidOutput")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									className: "satellite-ui__cell",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "satellite-ui__badge",
										children: [
											t("androidEffective"),
											" ",
											reading.effective.enabled === true ? t("androidOn") : t("androidOff")
										]
									})
								})]
							})
						] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "satellite-ui__notice",
						children: t("androidMachineHint")
					}),
					warnings.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "satellite-ui__notice",
						"data-state": "missing",
						role: "status",
						children: [
							t("androidPathWarning"),
							": ",
							warnings.join(", ")
						]
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "satellite-ui__error",
						role: "alert",
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "satellite-ui__actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button satellite-ui__button--primary",
								type: "button",
								disabled: busy || error !== void 0 || !changed,
								onClick: () => {
									if (error === void 0 && changed) write(plan.ops, draft === void 0 ? snapshot.revision : draftRevision.current);
								},
								children: busy ? t("saving") : t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "satellite-ui__button",
								type: "button",
								disabled: busy || draft === void 0,
								onClick: discard,
								children: t("discard")
							}),
							status
						]
					})
				]
			});
		}
		/**
		* Satellite 设置页：一个 settings.section，内部按"插件能力"分页。
		*
		* 页签只随**宿主实际服务**的命名空间出现：角色模型要 `satellite-node`，
		* Android 执行要 `satellite-android`。某个插件没装/停用时它那一页就不存在，
		* 不会留一张空页；以后再加插件只是多一个 page 条目。
		*/
		function SatelliteSettingsSection(props) {
			const { t, surface, catalog, androidSurface, served } = props;
			const [selected, setSelected] = (0, react.useState)(void 0);
			const fresh = (0, react.useId)();
			const pages = [];
			if (served.has(SETTINGS_NS)) pages.push("roles");
			if (served.has(ANDROID_NS)) pages.push("android");
			const active = selected !== void 0 && pages.includes(selected) ? selected : pages[0];
			if (active === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: "satellite-ui__title",
					children: t("sectionLabel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "satellite-ui__notice",
					children: t("settingsUnavailable")
				})]
			});
			const tabId = (page) => `${fresh}-tab-${page}`;
			const panelId = (page) => `${fresh}-panel-${page}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "satellite-ui",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "satellite-ui__title",
						children: t("sectionLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "tablist",
						"aria-label": t("tabsLabel"),
						className: "satellite-ui__tabs",
						children: pages.map((page) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							id: tabId(page),
							"data-page": page,
							"aria-selected": active === page,
							"aria-controls": panelId(page),
							className: active === page ? "satellite-ui__tab satellite-ui__tab--active" : "satellite-ui__tab",
							onClick: () => setSelected(page),
							children: t(page === "roles" ? "pageRoles" : "pageAndroid")
						}, page))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "tabpanel",
						id: panelId(active),
						"aria-labelledby": tabId(active),
						"data-active-page": active,
						children: active === "roles" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SatelliteRoutesSection, {
							t,
							surface,
							catalog
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AndroidExecutionSection, {
							t,
							surface: androidSurface
						})
					})
				]
			});
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, "en", en), "satellite-ui: English");
			ctx.effect(() => ctx.locale.register(NS, "zh", zh), "satellite-ui: Chinese");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				const tag = document.createElement("style");
				tag.dataset.plugin = NS;
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "satellite-ui: stylesheet");
			const surface = createSurface(ctx);
			const androidSurface = createAndroidSurface(ctx);
			const catalog = createCatalog(ctx);
			const slots = ctx.get("slots");
			const configForms = ctx.get("configForms");
			if (typeof configForms?.whileServed !== "function") return;
			ctx.effect(() => configForms.whileServed([SETTINGS_NS, ANDROID_NS], (served) => slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: SECTION_ID,
				order: SECTION_ORDER,
				label: () => t("sectionLabel"),
				locale: NS,
				inject: () => ({
					t,
					surface,
					catalog,
					androidSurface,
					served
				})
			}, SatelliteSettingsSection))), "satellite-ui: settings section");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
