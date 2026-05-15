# Track Row Layout Reference

## CSS (`PlanCompactView.module.css`)

```css
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  border-radius: 6px;
  transition: opacity 0.15s ease;
}

.rowDragging {
  opacity: 0.45;
}

.rowDropTarget {
  box-shadow: inset 0 0 0 2px var(--border-strong);
  background: var(--bg-subtle);
}

.dragHandle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: grab;
  flex-shrink: 0;
  border-radius: 4px;
  font: inherit;
  touch-action: none;
}

.trackLeft {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  max-width: min(280px, 42%);
}

.trackChipBtn {
  flex-shrink: 1;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 5px 10px;
  border-radius: 4px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.01em;
  line-height: 1.4;
  color: #fafafa;
  background: var(--text-primary);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  cursor: pointer;
  text-align: left;
}

.items {
  flex: 1;
  min-width: 0;
}

.itemsWrap {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  align-content: flex-start;
}

.itemChip {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
  background: var(--bg-subtle);
  border: none;
  box-shadow: inset 0 0 0 1px var(--border-subtle);
  max-width: min(100%, 320px);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}

.addItemBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  border: 1px dashed var(--border-strong);
  background: var(--surface-card);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.itemCluster {
  display: inline-flex;
  flex-direction: row;
  align-items: stretch;
  max-width: 100%;
  border-radius: 6px;
  min-width: 0;
}
```

## JSX (`PlanCompactView.tsx` — `renderTrackRow`)

```tsx
<li className={`${styles.row} ${isDragging ? styles.rowDragging : ""} ${isDropTarget ? styles.rowDropTarget : ""}`}
    onDragOver={...} onDrop={...}>

  {/* ---- Track label (left side) ---- */}
  <div className={styles.trackLeft}>
    <button className={styles.dragHandle} draggable onDragStart={...} onDragEnd={...}>
      <GripVertical size={14} strokeWidth={2} />
    </button>
    <button className={`${styles.trackChipBtn} ${editTrackId === track.id ? styles.trackChipBtnActive : ""}`}
            onClick={() => openEditTrack(track)}>
      {track.title}
    </button>
  </div>

  {/* ---- Items (right side, wraps) ---- */}
  <div className={styles.items} onDragOver={...} onContextMenu={...}>
    <div className={styles.itemsWrap}>
      {itemBlocks.map((block, blockIdx) => {
        const isLastBlock = blockIdx === itemBlocks.length - 1;
        return (
          <div className={`${styles.itemCluster} ${block.group ? styles.itemClusterLabeled : ""}`}>
            {block.group ? (
              <div className={styles.itemClusterRail} title={block.group.title}>
                <span className={styles.itemClusterLabel}>{block.group.title}</span>
              </div>
            ) : null}
            <div className={styles.itemClusterChips}>
              {block.items.map((item) => (
                <button className={`${styles.itemChip} ...`}
                        draggable onDragStart={...} onDragEnd={...}
                        onDragOver={...} onDrop={...} onClick={...}>
                  <span className={styles.itemChipRow}>
                    {/* devOrder badge or input */}
                    <span className={styles.itemChipFace}>{item.label}</span>
                    {/* chat icon */}
                  </span>
                  {/* hover tooltip */}
                </button>
              ))}
              {isLastBlock ? addItemButtonEl : null}
              {isLastBlock ? planItemDropEndEl : null}
            </div>
          </div>
        );
      })}
      {itemBlocks.length === 0 ? (
        <>
          {addItemButtonEl}
          {planItemDropEndEl}
        </>
      ) : null}
    </div>
  </div>
</li>
```

## Layout Structure

```
<li .row>                          flex-direction: row, gap: 8px
  ├── <div .trackLeft>             flex-shrink: 0, max-width: min(280px, 42%)
  │     ├── <button .dragHandle>   22px wide grip
  │     └── <button .trackChipBtn> track label ("1. App Shell")
  └── <div .items>                 flex: 1, min-width: 0
        └── <div .itemsWrap>       flex-wrap: wrap, gap: 6px
              ├── <div .itemCluster>
              │     └── <div .itemClusterChips>
              │           ├── <button .itemChip>  "1. Expo project init"
              │           ├── <button .itemChip>  "2. Navigation setup"
              │           └── ...
              ├── <button .addItemBtn>  "+"
              └── (drop target)
```

## The Problem

Wrapped item chips start at the left edge of `.items`, which is indented
past `.trackLeft`. This creates a large gap on the left of wrapped rows.

**Current:**
```
[drag] [Track Label]  [item1] [item2] [item3]
                      [item4] [item5] [+]      ← indented past track label
```

**Desired:**
```
[drag] [Track Label]  [item1] [item2] [item3]
       [item4] [item5] [+]                     ← flush left, below track label
```
