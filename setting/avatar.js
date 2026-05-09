export function initAvatarSettings(
    {
        charAvatarUrlInput,
        userAvatarUrlInput,
        charAvatarFrameUrlInput,
        userAvatarFrameUrlInput,
        unsplashAccessKeyInput,
        avatarProfileSelect,
        saveAvatarBtn,
        renameAvatarBtn,
        newAvatarBtn,
        avatarSubtabs = [],
        avatarPanes = [],
        adjustCharFrameBtn,
        adjustUserFrameBtn,
        frameAdjustPanel,
        frameAdjustTitle,
        frameSizeSlider,
        frameSizeValue,
        frameOffsetXSlider,
        frameOffsetXValue,
        frameOffsetYSlider,
        frameOffsetYValue,
        frameResetBtn,
        frameCloseBtn,
        frameProfileSelect,
        saveFrameBtn,
        renameFrameBtn,
        newFrameBtn,
    },
    {
        documentRef = document,
        localStorageRef = localStorage,
        alertRef = (message) => alert(message),
        confirmRef = (message) => confirm(message),
        unsplashAccessKey = '',
        setUnsplashAccessKey = () => {},
        reprocessUnsplashPlaceholders = () => {},
    } = {},
) {
    let avatarStyleTag = null;
    let avatarProfiles = {};
    let frameProfiles = {};
    let currentAdjustingFrame = null;
    const subtabList = avatarSubtabs ? Array.from(avatarSubtabs) : [];
    const paneList = avatarPanes ? Array.from(avatarPanes) : [];
    const frameAdjustments = {
        char: { size: 120, offsetX: 0, offsetY: 0 },
        user: { size: 120, offsetX: 0, offsetY: 0 },
    };

    if (subtabList.length && paneList.length) {
        subtabList.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.subtab;
                subtabList.forEach((b) =>
                    b.classList.toggle('active', b === btn),
                );
                paneList.forEach((pane) =>
                    pane.classList.toggle(
                        'active',
                        pane.id === `cip-avatar-pane-${target}`,
                    ),
                );
            });
        });
    }

    function initAvatarStyler() {
        avatarStyleTag = documentRef.getElementById('cip-avatar-styler');
        if (!avatarStyleTag) {
            avatarStyleTag = documentRef.createElement('style');
            avatarStyleTag.id = 'cip-avatar-styler';
            documentRef.head.appendChild(avatarStyleTag);
        }
    }

    function applyAvatars(charUrl, userUrl, charFrameUrl, userFrameUrl) {
        if (!avatarStyleTag) {
            console.error('Avatar styler tag not found.');
            return;
        }
        let cssRules = '';
        cssRules += `.custom-B_C_avar, .custom-B_U_avar { position: relative; overflow: visible !important; }\n`;
        if (charUrl) {
            const safeCharUrl = charUrl.replace(/'/g, "\\'");
            cssRules += `.custom-B_C_avar { background-image: url('${safeCharUrl}') !important; }\n`;
        }
        if (userUrl) {
            const safeUserUrl = userUrl.replace(/'/g, "\\'");
            cssRules += `.custom-B_U_avar { background-image: url('${safeUserUrl}') !important; }\n`;
        }
        if (charFrameUrl) {
            const safeCharFrameUrl = charFrameUrl.replace(/'/g, "\\'");
            const charAdj = frameAdjustments.char;
            const charTransformX = -50 + charAdj.offsetX;
            const charTransformY = -50 + charAdj.offsetY;
            cssRules += `.custom-B_C_avar::after { content: ""; position: absolute; top: 50%; left: 50%; width: ${charAdj.size}%; height: ${charAdj.size}%; transform: translate(${charTransformX}%, ${charTransformY}%); background-image: url('${safeCharFrameUrl}'); background-repeat: no-repeat; background-position: center; background-size: contain; pointer-events: none; z-index: 1; }\n`;
        }
        if (userFrameUrl) {
            const safeUserFrameUrl = userFrameUrl.replace(/'/g, "\\'");
            const userAdj = frameAdjustments.user;
            const userTransformX = -50 + userAdj.offsetX;
            const userTransformY = -50 + userAdj.offsetY;
            cssRules += `.custom-B_U_avar::after { content: ""; position: absolute; top: 50%; left: 50%; width: ${userAdj.size}%; height: ${userAdj.size}%; transform: translate(${userTransformX}%, ${userTransformY}%); background-image: url('${safeUserFrameUrl}'); background-repeat: no-repeat; background-position: center; background-size: contain; pointer-events: none; z-index: 1; }\n`;
        }
        avatarStyleTag.textContent = cssRules;
    }

    function applyFromInputs() {
        const charUrl = charAvatarUrlInput?.value.trim() || '';
        const userUrl = userAvatarUrlInput?.value.trim() || '';
        const charFrameUrl = charAvatarFrameUrlInput?.value.trim() || '';
        const userFrameUrl = userAvatarFrameUrlInput?.value.trim() || '';
        applyAvatars(charUrl, userUrl, charFrameUrl, userFrameUrl);
    }

    function populateAvatarSelect() {
        if (!avatarProfileSelect) return;
        const savedSelection = avatarProfileSelect.value;
        avatarProfileSelect.innerHTML = '<option value="">选择配置...</option>';
        for (const profileName in avatarProfiles) {
            const option = documentRef.createElement('option');
            option.value = profileName;
            option.textContent = profileName;
            avatarProfileSelect.appendChild(option);
        }
        avatarProfileSelect.value = avatarProfiles[savedSelection]
            ? savedSelection
            : '';
    }

    function populateFrameSelect() {
        if (!frameProfileSelect) return;
        const savedSelection = frameProfileSelect.value;
        frameProfileSelect.innerHTML = '<option value="">选择配置...</option>';
        for (const profileName in frameProfiles) {
            const option = documentRef.createElement('option');
            option.value = profileName;
            option.textContent = profileName;
            frameProfileSelect.appendChild(option);
        }
        frameProfileSelect.value = frameProfiles[savedSelection]
            ? savedSelection
            : '';
    }

    function saveAvatarProfile() {
        if (!avatarProfileSelect) return;
        const selected = avatarProfileSelect.value;
        if (!selected) return;
        avatarProfiles[selected] = {
            char: charAvatarUrlInput?.value.trim() || '',
            user: userAvatarUrlInput?.value.trim() || '',
        };
        localStorageRef.setItem('cip_avatar_profiles_v1', JSON.stringify(avatarProfiles));
        localStorageRef.setItem('cip_last_avatar_profile_v1', selected);
    }

    function renameAvatarProfile() {
        if (!avatarProfileSelect) return;
        const selected = avatarProfileSelect.value;
        if (!selected) return;
        const newName = prompt('编辑配置名', selected);
        if (!newName || newName === selected) return;
        avatarProfiles[newName.trim()] = avatarProfiles[selected];
        delete avatarProfiles[selected];
        localStorageRef.setItem('cip_avatar_profiles_v1', JSON.stringify(avatarProfiles));
        populateAvatarSelect();
        avatarProfileSelect.value = newName.trim();
        localStorageRef.setItem('cip_last_avatar_profile_v1', newName.trim());
    }

    function createAvatarProfile() {
        const name = prompt('新建配置名', '新头像配置');
        if (!name) return;
        avatarProfiles[name.trim()] = {
            char: charAvatarUrlInput?.value.trim() || '',
            user: userAvatarUrlInput?.value.trim() || '',
        };
        localStorageRef.setItem('cip_avatar_profiles_v1', JSON.stringify(avatarProfiles));
        populateAvatarSelect();
        if (avatarProfileSelect) avatarProfileSelect.value = name.trim();
        localStorageRef.setItem('cip_last_avatar_profile_v1', name.trim());
    }

    function saveFrameProfile() {
        if (!frameProfileSelect) return;
        const selected = frameProfileSelect.value;
        if (!selected) return;
        frameProfiles[selected] = {
            charFrame: charAvatarFrameUrlInput?.value.trim() || '',
            userFrame: userAvatarFrameUrlInput?.value.trim() || '',
            charFrameAdj: { ...frameAdjustments.char },
            userFrameAdj: { ...frameAdjustments.user },
        };
        localStorageRef.setItem('cip_frame_profiles_v1', JSON.stringify(frameProfiles));
        localStorageRef.setItem('cip_last_frame_profile_v1', selected);
    }

    function renameFrameProfile() {
        if (!frameProfileSelect) return;
        const selected = frameProfileSelect.value;
        if (!selected) return;
        const newName = prompt('编辑配置名', selected);
        if (!newName || newName === selected) return;
        frameProfiles[newName.trim()] = frameProfiles[selected];
        delete frameProfiles[selected];
        localStorageRef.setItem('cip_frame_profiles_v1', JSON.stringify(frameProfiles));
        populateFrameSelect();
        frameProfileSelect.value = newName.trim();
        localStorageRef.setItem('cip_last_frame_profile_v1', newName.trim());
    }

    function createFrameProfile() {
        const name = prompt('新建配置名', '新头像框配置');
        if (!name) return;
        frameProfiles[name.trim()] = {
            charFrame: charAvatarFrameUrlInput?.value.trim() || '',
            userFrame: userAvatarFrameUrlInput?.value.trim() || '',
            charFrameAdj: { ...frameAdjustments.char },
            userFrameAdj: { ...frameAdjustments.user },
        };
        localStorageRef.setItem('cip_frame_profiles_v1', JSON.stringify(frameProfiles));
        populateFrameSelect();
        if (frameProfileSelect) frameProfileSelect.value = name.trim();
        localStorageRef.setItem('cip_last_frame_profile_v1', name.trim());
    }

    function loadAvatarProfiles() {
        try {
            const savedProfiles = localStorageRef.getItem('cip_avatar_profiles_v1');
            avatarProfiles = savedProfiles ? JSON.parse(savedProfiles) : {};
        } catch (error) {
            console.warn('加载头像配置失败', error);
            avatarProfiles = {};
        }
        populateAvatarSelect();
        const lastProfileName = localStorageRef.getItem('cip_last_avatar_profile_v1');
        if (lastProfileName && avatarProfiles[lastProfileName]) {
            if (avatarProfileSelect) avatarProfileSelect.value = lastProfileName;
            const profile = avatarProfiles[lastProfileName];
            if (charAvatarUrlInput) charAvatarUrlInput.value = profile.char || '';
            if (userAvatarUrlInput) userAvatarUrlInput.value = profile.user || '';
            applyFromInputs();
        }
    }

    function loadFrameProfiles() {
        try {
            const savedProfiles = localStorageRef.getItem('cip_frame_profiles_v1');
            frameProfiles = savedProfiles ? JSON.parse(savedProfiles) : {};
        } catch (error) {
            console.warn('加载头像框配置失败', error);
            frameProfiles = {};
        }
        populateFrameSelect();
        const lastFrameProfileName = localStorageRef.getItem(
            'cip_last_frame_profile_v1',
        );
        if (lastFrameProfileName && frameProfiles[lastFrameProfileName]) {
            if (frameProfileSelect) frameProfileSelect.value = lastFrameProfileName;
            const profile = frameProfiles[lastFrameProfileName];
            if (charAvatarFrameUrlInput)
                charAvatarFrameUrlInput.value = profile.charFrame || '';
            if (userAvatarFrameUrlInput)
                userAvatarFrameUrlInput.value = profile.userFrame || '';
            if (profile.charFrameAdj) {
                frameAdjustments.char = { ...profile.charFrameAdj };
            }
            if (profile.userFrameAdj) {
                frameAdjustments.user = { ...profile.userFrameAdj };
            }
            applyFromInputs();
        } else {
            applyFromInputs();
        }
    }

    avatarProfileSelect?.addEventListener('change', (e) => {
        const profileName = e.target.value;
        if (profileName && avatarProfiles[profileName]) {
            const profile = avatarProfiles[profileName];
            if (charAvatarUrlInput) charAvatarUrlInput.value = profile.char || '';
            if (userAvatarUrlInput) userAvatarUrlInput.value = profile.user || '';
            applyFromInputs();
            localStorageRef.setItem('cip_last_avatar_profile_v1', profileName);
        } else if (!profileName) {
            if (charAvatarUrlInput) charAvatarUrlInput.value = '';
            if (userAvatarUrlInput) userAvatarUrlInput.value = '';
            applyFromInputs();
            localStorageRef.removeItem('cip_last_avatar_profile_v1');
        }
    });

    saveAvatarBtn?.addEventListener('click', saveAvatarProfile);
    renameAvatarBtn?.addEventListener('click', renameAvatarProfile);
    newAvatarBtn?.addEventListener('click', createAvatarProfile);

    frameProfileSelect?.addEventListener('change', (e) => {
        const profileName = e.target.value;
        if (profileName && frameProfiles[profileName]) {
            const profile = frameProfiles[profileName];
            if (charAvatarFrameUrlInput)
                charAvatarFrameUrlInput.value = profile.charFrame || '';
            if (userAvatarFrameUrlInput)
                userAvatarFrameUrlInput.value = profile.userFrame || '';
            if (profile.charFrameAdj) {
                frameAdjustments.char = { ...profile.charFrameAdj };
            }
            if (profile.userFrameAdj) {
                frameAdjustments.user = { ...profile.userFrameAdj };
            }
            applyFromInputs();
            localStorageRef.setItem('cip_last_frame_profile_v1', profileName);
        } else if (!profileName) {
            if (charAvatarFrameUrlInput) charAvatarFrameUrlInput.value = '';
            if (userAvatarFrameUrlInput) userAvatarFrameUrlInput.value = '';
            frameAdjustments.char = { size: 120, offsetX: 0, offsetY: 0 };
            frameAdjustments.user = { size: 120, offsetX: 0, offsetY: 0 };
            applyFromInputs();
            localStorageRef.removeItem('cip_last_frame_profile_v1');
        }
    });

    saveFrameBtn?.addEventListener('click', saveFrameProfile);
    renameFrameBtn?.addEventListener('click', renameFrameProfile);
    newFrameBtn?.addEventListener('click', createFrameProfile);

    adjustCharFrameBtn?.addEventListener('click', () => {
        currentAdjustingFrame = 'char';
        if (frameAdjustTitle) frameAdjustTitle.textContent = '调整角色头像框';
        if (frameSizeSlider) frameSizeSlider.value = frameAdjustments.char.size;
        if (frameSizeValue)
            frameSizeValue.textContent = frameAdjustments.char.size;
        if (frameOffsetXSlider)
            frameOffsetXSlider.value = frameAdjustments.char.offsetX;
        if (frameOffsetXValue)
            frameOffsetXValue.textContent = frameAdjustments.char.offsetX;
        if (frameOffsetYSlider)
            frameOffsetYSlider.value = frameAdjustments.char.offsetY;
        if (frameOffsetYValue)
            frameOffsetYValue.textContent = frameAdjustments.char.offsetY;
        frameAdjustPanel?.classList.remove('hidden');
    });

    adjustUserFrameBtn?.addEventListener('click', () => {
        currentAdjustingFrame = 'user';
        if (frameAdjustTitle) frameAdjustTitle.textContent = '调整你的头像框';
        if (frameSizeSlider) frameSizeSlider.value = frameAdjustments.user.size;
        if (frameSizeValue)
            frameSizeValue.textContent = frameAdjustments.user.size;
        if (frameOffsetXSlider)
            frameOffsetXSlider.value = frameAdjustments.user.offsetX;
        if (frameOffsetXValue)
            frameOffsetXValue.textContent = frameAdjustments.user.offsetX;
        if (frameOffsetYSlider)
            frameOffsetYSlider.value = frameAdjustments.user.offsetY;
        if (frameOffsetYValue)
            frameOffsetYValue.textContent = frameAdjustments.user.offsetY;
        frameAdjustPanel?.classList.remove('hidden');
    });

    frameSizeSlider?.addEventListener('input', () => {
        if (!currentAdjustingFrame) return;
        const value = parseInt(frameSizeSlider.value, 10) || 120;
        frameAdjustments[currentAdjustingFrame].size = value;
        if (frameSizeValue) frameSizeValue.textContent = value;
        applyFromInputs();
    });

    frameOffsetXSlider?.addEventListener('input', () => {
        if (!currentAdjustingFrame) return;
        const value = parseInt(frameOffsetXSlider.value, 10) || 0;
        frameAdjustments[currentAdjustingFrame].offsetX = value;
        if (frameOffsetXValue) frameOffsetXValue.textContent = value;
        applyFromInputs();
    });

    frameOffsetYSlider?.addEventListener('input', () => {
        if (!currentAdjustingFrame) return;
        const value = parseInt(frameOffsetYSlider.value, 10) || 0;
        frameAdjustments[currentAdjustingFrame].offsetY = value;
        if (frameOffsetYValue) frameOffsetYValue.textContent = value;
        applyFromInputs();
    });

    frameResetBtn?.addEventListener('click', () => {
        if (!currentAdjustingFrame) return;
        frameAdjustments[currentAdjustingFrame] = {
            size: 120,
            offsetX: 0,
            offsetY: 0,
        };
        if (frameSizeSlider) frameSizeSlider.value = 120;
        if (frameSizeValue) frameSizeValue.textContent = 120;
        if (frameOffsetXSlider) frameOffsetXSlider.value = 0;
        if (frameOffsetXValue) frameOffsetXValue.textContent = 0;
        if (frameOffsetYSlider) frameOffsetYSlider.value = 0;
        if (frameOffsetYValue) frameOffsetYValue.textContent = 0;
        applyFromInputs();
    });

    frameCloseBtn?.addEventListener('click', () => {
        frameAdjustPanel?.classList.add('hidden');
    });

    if (unsplashAccessKeyInput) {
        unsplashAccessKeyInput.value = unsplashAccessKey || '';
        unsplashAccessKeyInput.addEventListener('input', (event) => {
            setUnsplashAccessKey(event.target.value || '');
        });
        unsplashAccessKeyInput.addEventListener('change', () => {
            if ((unsplashAccessKeyInput.value || '').trim()) {
                reprocessUnsplashPlaceholders();
            }
        });
    }

    initAvatarStyler();
    loadAvatarProfiles();
    loadFrameProfiles();

    return {
        applyAvatars,
        getFrameAdjustments: () => ({
            char: { ...frameAdjustments.char },
            user: { ...frameAdjustments.user },
        }),
    };
}
