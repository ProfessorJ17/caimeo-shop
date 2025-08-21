gsap.registerPlugin(Observer, SplitText, DrawSVGPlugin, MotionPathPlugin);

window.addEventListener('load', function() {
            function initSplitText(elements) {
                const textWrappers = document.querySelectorAll(elements);
                if (!textWrappers.length) return false;
                new SplitText(elements, { type: 'lines', linesClass: 'fade-overflow' });

                textWrappers.forEach(textWrapper => {
                    textWrapper.querySelectorAll('.fade-overflow').forEach((letterWrapp) => {
                        const letter = letterWrapp.innerHTML;
                        letterWrapp.innerText = '';
                        letterWrapp.innerHTML = `<div class='fade-el'>${letter}</div>`;
                    });
                });
            }

            initSplitText('.split');

            const sections = gsap.utils.toArray('.banner-slide');
            const wrap = gsap.utils.wrap(0, sections.length);
            const tree = document.querySelector('.banner-tree');
            const wings = document.querySelector('.wings');

            let animating, treeVisible;
            let currentIndex = 0;

            function gotoSection(index, direction) {
                animating = true;
                treeVisible = false;
                index = wrap(index);

                const currentSection = sections[currentIndex];
                const textCurrent = currentSection.querySelectorAll('.fade-overflow');
                const nextSection = sections[index];
                const textNext = nextSection.querySelectorAll('.fade-overflow');

                gsap
                    .timeline({
                        defaults: { duration: 1.2 },
                        onComplete: () => {
                            animating = false;
                        },
                    })
                    .fromTo(currentSection, {
                        scale: 1,
                        alpha: 1,
                    }, {
                        scale: 0.7,
                        alpha: 0,
                        ease: 'power0.easeIn',
                    }, 0)
                    .fromTo(textCurrent, {
                        y: 0,
                    }, {
                        y: -350 * direction,
                        stagger: {
                            each: 0.1,
                            from: direction == 1 ? 'start' : 'end',
                        },
                        ease: 'power0.easeIn',
                    }, 0)
                    .fromTo(tree, {
                        scale: currentIndex > 0 ? 2.4 : 1,
                        yPercent: currentIndex > 0 ? 125 : 0,
                    }, {
                        scale: index > 0 ? 2.4 : 1,
                        yPercent: index > 0 ? 125 : 0,
                        duration: 2.4,
                    }, '<')
                    .fromTo(wings, {
                        alpha: currentIndex > 0 ? 0 : 1,
                    }, {
                        alpha: index > 0 ? 0 : 1,
                        duration: 2.4,
                    }, '<')
                    .fromTo(textNext, {
                        y: 400 * direction,
                    }, {
                        y: 0,
                        stagger: {
                            each: 0.02,
                            from: direction == 1 ? 'start' : 'end',
                        },
                        ease: 'power1.easeOut',
                    }, '<1.2')
                    .fromTo([nextSection], {
                        scale: 0.7,
                        alpha: 0,
                    }, {
                        scale: 1,
                        alpha: 1,
                        ease: 'power1.easeOut',
                    }, '<');

                currentIndex = index;
            }

            function treeAnimation() {
                if (treeVisible) return;
                animating = true;
                treeVisible = true;
                gsap.timeline({
                    onComplete: () => {
                        animating = false;
                    },
                })
                .to('.banner-slide', {
                    y: '150%',
                    alpha: 0,
                    duration: 1,
                })
                .to(tree, {
                    scale: 1,
                    yPercent: 0,
                    duration: 1,
                }, '<')
                .to(tree, {
                    alpha: 0,
                    duration: 1,
                })
                .set('.tree svg', {
                    display: 'block',
                })
                .fromTo('.tree-svg__bottom',
                    {
                        drawSVG: '0%',
                        strokeWidth: 33,
                    },
                    {
                        drawSVG: '100%',
                        strokeWidth: 33,
                        duration: 1,
                    }
                )
                .fromTo('.tree-svg__top', {
                    drawSVG: '0%',
                    strokeWidth: 33,
                }, {
                    drawSVG: '100%',
                    strokeWidth: 33,
                    duration: 1,
                })
                .fromTo('.tree-svg__left', {
                    drawSVG: '0%',
                    strokeWidth: 33,
                    rotate: '25deg',
                    transformOrigin: 'bottom right',
                }, {
                    drawSVG: '75%',
                    strokeWidth: 33,
                    rotate: '25deg',
                    transformOrigin: 'bottom right',
                    duration: 1,
                }, '<')
                .fromTo('.tree-svg__right', {
                    drawSVG: '0%',
                    strokeWidth: 33,
                    rotate: '-25deg',
                    transformOrigin: 'bottom left',
                }, {
                    drawSVG: '75%',
                    strokeWidth: 33,
                    rotate: '-25deg',
                    transformOrigin: 'bottom left',
                    duration: 1,
                }, '<')
                .fromTo('.tree-svg__right-top', {
                    drawSVG: '0%',
                    strokeWidth: 33,
                    rotate: '-13deg',
                    transformOrigin: 'bottom left',
                }, {
                    drawSVG: '85%',
                    strokeWidth: 33,
                    rotate: '-13deg',
                    transformOrigin: 'bottom left',
                    duration: 1,
                }, '<')
                .fromTo('.tree-svg__left-top', {
                    drawSVG: '0%',
                    strokeWidth: 33,
                    rotate: '13deg',
                    transformOrigin: 'bottom right',
                }, {
                    drawSVG: '85%',
                    strokeWidth: 33,
                    rotate: '13deg',
                    transformOrigin: 'bottom right',
                    duration: 1,
                }, '<')
                .to('.tree-svg__branches', {
                    drawSVG: '100%',
                    strokeWidth: 3,
                    rotate: '0',
                    duration: 1,
                })
                .to('.tree-svg__bottom', {
                    strokeWidth: 3,
                    duration: 1,
                }, '<')
                .to('.tree-circle', {
                    scale: 0.65,
                    duration: 1,
                }, '<')
                .to('.tree-circle__big', {
                    scale: 0.65,
                    duration: 1,
                }, '<')
                .to('.tree-wings', {
                    y: '-100%',
                    alpha: 1,
                    duration: 1.5,
                }, '<')
                .to('.tree-circle__big', {
                    scale: 1,
                    duration: 0.5,
                }, '<0.5')
                .fromTo('.tree-title', {
                    alpha: 0,
                    y: '+=100%',
                }, {
                    alpha: 1,
                    y: '-=100%',
                    duration: 0.7,
                })
                .fromTo('.tree-ball', {
                    alpha: 1,
                    scale: 0,
                }, {
                    alpha: 1,
                    scale: 1,
                    duration: 0.7,
                }, '<');
            }

            Observer.create({
                type: 'wheel,touch,pointer',
                preventDefault: true,
                wheelSpeed: -1,
                onUp: () => {
                    if (animating) return;
                    if (currentIndex + 1 > sections.length - 1) {
                        treeAnimation();
                    } else {
                        gotoSection(currentIndex + 1, +1);
                    }
                },
                onDown: () => {
                    // if (animating) return;
                    // if (currentIndex - 1 > sections.length - 1) {
                        // gotoSection(currentIndex - 1, -1);
                    // } else {
                        // treeAnimation();
                    // }
                },
                tolerance: 10,
            });

            document.addEventListener('keydown', logKey);

            function logKey(e) {
                if ((e.code === 'ArrowUp' || e.code === 'ArrowLeft') && !animating) {
                    gotoSection(currentIndex - 1, -1);
                }
                if (
                    (e.code === 'ArrowDown' ||
                    e.code === 'ArrowRight' ||
                    e.code === 'Space' ||
                    e.code === 'Enter') &&
                    !animating
                ) {
                    gotoSection(currentIndex + 1, 1);
                }
            }
  
  document.querySelectorAll('.tree-title').forEach((element) => {
                const elementPosition = element.getAttribute('data-position');

                const timelineHover = gsap.timeline({
                    paused: true,
                });

                let endSmallPos = 0.11, endBigPos = 0.545;

                if (elementPosition.includes('-top')) {
                    endSmallPos = 0.12;
                    endBigPos = 0.595;
                } else if (elementPosition.includes('top')) {
                    endSmallPos = 0.13;
                    endBigPos = 0.605;
                }


                timelineHover
                    .to(`.tree-title[data-position="${elementPosition}"]`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        scale: 1.33,
                        y: '-=30%',
                    })
                    .to(`.tree-ball[data-position="${elementPosition}"] .tree-ball__1`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        scale: 2.25,
                    }, '<')
                    .to(`.tree-svg__branches[data-position="${elementPosition}"]`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        strokeWidth: 9,
                    }, '<')
                    .fromTo('.tree-circle__big', {
                        boxShadow: '0 0 0 1px rgb(52 31 55)',
                    }, {
                        duration: 0.4,
                        ease: 'power1.outIn',
                        boxShadow: '0 0 0 3px rgb(52 31 55)',
                    }, '<')
                    .fromTo('.tree-circle__small', {
                        boxShadow: '0 0 0 3px rgb(52 31 55)',
                    }, {
                        duration: 0.4,
                        ease: 'power1.outIn',
                        boxShadow: '0 0 0 1px rgb(52 31 55)',
                    }, '<')
                    .to(`.tree-title[data-position="${elementPosition}"] .tree-title__decor.left`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        alpha: 1,
                        x: '-100%',
                    })
                    .to(`.tree-title[data-position="${elementPosition}"] .tree-title__decor.right`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        alpha: 1,
                        x: '100%',
                    }, '<')
                    .to(`.tree-ball[data-position="${elementPosition}"] .tree-ball__2`, {
                        duration: 0.7,
                        ease: 'power1.inOut',
                        motionPath: {
                            path: `.tree-svg__branches[data-position="${elementPosition}"]`,
                            align: `.tree-svg__branches[data-position="${elementPosition}"]`,
                            autoRotate: true,
                            alignOrigin: [0.5, 0.5],
                            start: 1,
                            end: endSmallPos,
                        },
                    }, '<')
                    .to(`.tree-ball[data-position="${elementPosition}"] .tree-ball__3`, {
                        duration: 0.4,
                        ease: 'power1.inOut',
                        motionPath: {
                            path: `.tree-svg__branches[data-position="${elementPosition}"]`,
                            align: `.tree-svg__branches[data-position="${elementPosition}"]`,
                            autoRotate: true,
                            alignOrigin: [0.5, 0.5],
                            start: 1,
                            end: endBigPos,
                        },
                    }, '<0.3');

                // const dataHover = { position: elementPosition, timeline: timelineHover };
                // tlHoverArray.push(dataHover);

                element.addEventListener('mouseover', () => {
                    timelineHover.play();
                });

                element.addEventListener('mouseout', () => {
                    timelineHover.reverse();
                });
            });
        });
