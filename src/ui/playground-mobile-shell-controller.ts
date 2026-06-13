export function getPlaygroundMobileShellElementRefsScript(): string {
	return `
		const mobileTopbar = document.getElementById("mobile-topbar");
		const mobileBrandButton = document.getElementById("mobile-brand-button");
		const mobileNewConversationButton = document.getElementById("mobile-new-conversation-button");
		const mobileOverflowMenuButton = document.getElementById("mobile-overflow-menu-button");
		const mobileOverflowMenu = document.getElementById("mobile-overflow-menu");
		const mobileMenuFileButton = document.getElementById("mobile-menu-file-button");
		const mobileMenuLibraryButton = document.getElementById("mobile-menu-library-button");
		const mobileMenuTaskInboxButton = document.getElementById("mobile-menu-task-inbox-button");
		const mobileMenuModelConfigButton = document.getElementById("mobile-menu-model-config-button");
		const mobileMenuBrowserWorkbenchButton = document.getElementById("mobile-menu-browser-workbench-button");
		const mobileTaskInboxUnreadBadge = document.getElementById("mobile-task-inbox-unread-badge");
		const mobileMenuConnButton = document.getElementById("mobile-menu-conn-button");
		const mobileDrawerBackdrop = document.getElementById("mobile-drawer-backdrop");
		const mobileConversationDrawer = document.getElementById("mobile-conversation-drawer");
		const mobileConversationList = document.getElementById("mobile-conversation-list");
		const desktopConversationList = document.getElementById("desktop-conversation-list");
		const mobileDrawerCloseButton = document.getElementById("mobile-drawer-close-button");
	`;
}

export function getPlaygroundMobileShellControllerScript(): string {
	return `
		function setMobileOverflowMenuOpen(next) {
			state.mobileOverflowMenuOpen = Boolean(next);
			mobileOverflowMenu.hidden = !state.mobileOverflowMenuOpen;
			mobileOverflowMenuButton.setAttribute("aria-expanded", state.mobileOverflowMenuOpen ? "true" : "false");
		}

		function closeMobileOverflowMenu() {
			setMobileOverflowMenuOpen(false);
		}

		function setMobileConversationDrawerOpen(next) {
			state.mobileConversationDrawerOpen = Boolean(next);
			mobileDrawerBackdrop.hidden = !state.mobileConversationDrawerOpen;
			mobileConversationDrawer.hidden = !state.mobileConversationDrawerOpen;
			mobileBrandButton.setAttribute("aria-expanded", state.mobileConversationDrawerOpen ? "true" : "false");
			if (state.mobileConversationDrawerOpen) {
				closeMobileOverflowMenu();
				renderConversationDrawer();
			}
		}

		function closeMobileConversationDrawer() {
			setMobileConversationDrawerOpen(false);
			mobileConversationList.replaceChildren();
		}
	`;
}

export function getPlaygroundMobileShellEventHandlersScript(): string {
	return `
		mobileNewConversationButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			void startNewConversation().then((created) => {
				if (created) {
					messageInput.focus();
				}
			});
		});
		mobileBrandButton.addEventListener("click", (event) => {
			event.stopPropagation();
			setMobileConversationDrawerOpen(!state.mobileConversationDrawerOpen);
			void syncConversationCatalog({
				silent: true,
				activateCurrent: false,
			});
		});
		mobileDrawerBackdrop.addEventListener("click", closeMobileConversationDrawer);
		mobileDrawerCloseButton.addEventListener("click", closeMobileConversationDrawer);
		mobileOverflowMenuButton.addEventListener("click", (event) => {
			event.stopPropagation();
			setMobileOverflowMenuOpen(!state.mobileOverflowMenuOpen);
		});
		mobileMenuFileButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			fileInput.click();
		});
		mobileMenuLibraryButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			openAssetLibrary(mobileOverflowMenuButton);
		});
		mobileMenuModelConfigButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			void openModelConfigDialog(mobileOverflowMenuButton);
		});
		mobileMenuBrowserWorkbenchButton.addEventListener("click", () => {
			closeMobileOverflowMenu();
			void openBrowserWorkbench(mobileOverflowMenuButton);
		});

		document.addEventListener("click", (event) => {
			if (!state.mobileOverflowMenuOpen) {
				return;
			}
			if (!mobileTopbar.contains(event.target)) {
				closeMobileOverflowMenu();
			}
		});
		window.matchMedia("(min-width: 641px)").addEventListener("change", () => {
			renderConversationDrawer();
		});
		desktopConversationList.addEventListener("scroll", () => {
			scheduleConversationVirtualScroll(desktopConversationList);
		});
		mobileConversationList.addEventListener("scroll", () => {
			scheduleConversationVirtualScroll(mobileConversationList);
		});
		desktopConversationList.addEventListener("click", handleConversationListClick);
		mobileConversationList.addEventListener("click", handleConversationListClick);
	`;
}
