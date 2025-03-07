import { saveAs } from 'file-saver'
import { useState, ReactNode } from 'react'
import { Button, IconDownload, IconX, IconTrash, Dropdown, IconChevronDown } from 'ui'
import { PermissionAction } from '@supabase/shared-types/out/constants'

import { checkPermissions, useStore } from 'hooks'
import FilterDropdown from './filter'
import SortPopover from './sort'
import RefreshButton from './RefreshButton'
import { confirmAlert } from 'components/to-be-cleaned/ModalsDeprecated/ConfirmModal'
import { Sort, Filter, SupaTable } from 'components/grid/types'
import { exportRowsToCsv } from 'components/grid/utils'
import { useDispatch, useTrackedState } from 'components/grid/store'
import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import { useTableRowDeleteMutation } from 'data/table-rows/table-row-delete-mutation'
import { useTableRowDeleteAllMutation } from 'data/table-rows/table-row-delete-all-mutation'
import { useTableRowTruncateMutation } from 'data/table-rows/table-row-truncate-mutation'
import { useTableRowsCountQuery } from 'data/table-rows/table-rows-count-query'
import { useTableRowsQuery } from 'data/table-rows/table-rows-query'

// [Joshen] CSV exports require this guard as a fail-safe if the table is
// just too large for a browser to keep all the rows in memory before
// exporting. Either that or export as multiple CSV sheets with max n rows each
const MAX_EXPORT_ROW_COUNT = 500000

export type HeaderProps = {
  table: SupaTable
  sorts: Sort[]
  filters: Filter[]
  onAddColumn?: () => void
  onAddRow?: () => void
  headerActions?: ReactNode
}

const Header = ({ table, sorts, filters, onAddColumn, onAddRow, headerActions }: HeaderProps) => {
  const state = useTrackedState()
  const { selectedRows } = state

  return (
    <div className="flex h-10 items-center justify-between bg-scale-100 px-5 py-1.5 dark:bg-scale-300">
      {selectedRows.size > 0 ? (
        <RowHeader table={table} sorts={sorts} filters={filters} />
      ) : (
        <DefaultHeader table={table} onAddColumn={onAddColumn} onAddRow={onAddRow} />
      )}
      <div className="sb-grid-header__inner">{headerActions}</div>
    </div>
  )
}

export default Header

type DefaultHeaderProps = {
  table: SupaTable
  onAddColumn?: () => void
  onAddRow?: () => void
}
const DefaultHeader = ({ table, onAddColumn, onAddRow }: DefaultHeaderProps) => {
  const canAddNew = onAddRow !== undefined || onAddColumn !== undefined

  // [Joshen] Using this logic to block both column and row creation/update/delete
  const canCreateColumns = checkPermissions(PermissionAction.TENANT_SQL_ADMIN_WRITE, 'columns')

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <RefreshButton table={table} />
        <FilterDropdown />
        <SortPopover />
      </div>
      {canAddNew && (
        <>
          <div className="h-[20px] w-px border-r border-scale-600"></div>
          <div className="flex items-center gap-2">
            {canCreateColumns && (
              <Dropdown
                side="bottom"
                align="start"
                size="medium"
                overlay={[
                  ...(onAddRow !== undefined
                    ? [
                        <Dropdown.Item
                          key="add-row"
                          className="group"
                          onClick={onAddRow}
                          disabled={onAddRow === undefined}
                          icon={
                            <div className="-mt-2 pr-1.5">
                              <div className="border border-scale-1000 w-[15px] h-[4px]" />
                              <div className="border border-scale-1000 w-[15px] h-[4px] my-[2px]" />
                              <div
                                className={[
                                  'border border-scale-1100 w-[15px] h-[4px] translate-x-0.5',
                                  'transition duration-200 group-hover:border-brand-900 group-hover:translate-x-0',
                                ].join(' ')}
                              />
                            </div>
                          }
                        >
                          <div className="">
                            <p>Insert row</p>
                            <p className="text-scale-1000">Insert a new row into {table.name}</p>
                          </div>
                        </Dropdown.Item>,
                      ]
                    : []),
                  ...(onAddColumn !== undefined
                    ? [
                        <Dropdown.Item
                          key="add-column"
                          className="group"
                          onClick={onAddColumn}
                          disabled={onAddColumn === undefined}
                          icon={
                            <div className="flex -mt-2 pr-1.5">
                              <div className="border border-scale-1000 w-[4px] h-[15px]" />
                              <div className="border border-scale-1000 w-[4px] h-[15px] mx-[2px]" />
                              <div
                                className={[
                                  'border border-scale-1100 w-[4px] h-[15px] -translate-y-0.5',
                                  'transition duration-200 group-hover:border-brand-900 group-hover:translate-y-0',
                                ].join(' ')}
                              />
                            </div>
                          }
                        >
                          <div className="">
                            <p>Insert column</p>
                            <p className="text-scale-1000">Insert a new column into {table.name}</p>
                          </div>
                        </Dropdown.Item>,
                      ]
                    : []),
                ]}
              >
                <Button size="tiny" icon={<IconChevronDown size={14} strokeWidth={1.5} />}>
                  Insert
                </Button>
              </Dropdown>
            )}
          </div>
        </>
      )}
    </div>
  )
}

type RowHeaderProps = {
  table: SupaTable
  sorts: Sort[]
  filters: Filter[]
}
const RowHeader = ({ table, sorts, filters }: RowHeaderProps) => {
  const { ui } = useStore()
  const state = useTrackedState()
  const dispatch = useDispatch()

  const { project } = useProjectContext()
  const { mutateAsync: deleteRows } = useTableRowDeleteMutation()
  const { mutateAsync: deleteAllRows } = useTableRowDeleteAllMutation()
  const { mutateAsync: truncateRows } = useTableRowTruncateMutation()

  const { data } = useTableRowsQuery({
    queryKey: [table.schema, table.name],
    projectRef: project?.ref,
    connectionString: project?.connectionString,
    table,
    sorts,
    filters,
    page: state.page,
    limit: state.rowsPerPage,
  })

  const allRows = data?.rows ?? []

  const { data: countData } = useTableRowsCountQuery(
    {
      queryKey: [table?.schema, table?.name, 'count'],
      projectRef: project?.ref,
      connectionString: project?.connectionString,
      table,
      filters,
    },
    { keepPreviousData: true }
  )

  const totalRows = countData?.count ?? 0

  const { selectedRows, editable, allRowsSelected } = state

  const onSelectAllRows = () => {
    dispatch({
      type: 'SELECT_ALL_ROWS',
      payload: { selectedRows: new Set(allRows.map((row) => row.idx)) },
    })
  }

  const onRowsDelete = () => {
    const numRows = allRowsSelected ? totalRows : selectedRows.size
    confirmAlert({
      title: 'Confirm to delete',
      message: `Are you sure you want to delete the selected ${numRows} row${
        numRows > 1 ? 's' : ''
      }? This action cannot be undone.`,
      confirmText: `Delete ${numRows} rows`,
      onAsyncConfirm: async () => {
        if (!project) return

        if (allRowsSelected) {
          try {
            if (filters.length === 0) {
              await truncateRows({
                projectRef: project.ref,
                connectionString: project.connectionString,
                table,
              })
            } else {
              await deleteAllRows({
                projectRef: project.ref,
                connectionString: project.connectionString,
                table,
                filters,
              })
            }

            dispatch({ type: 'REMOVE_ALL_ROWS' })
            dispatch({
              type: 'SELECTED_ROWS_CHANGE',
              payload: { selectedRows: new Set() },
            })
          } catch (error) {
            if (state.onError) state.onError(error)
          }
        } else {
          const rowIdxs = Array.from(selectedRows) as number[]
          const rows = allRows.filter((x) => rowIdxs.includes(x.idx))

          try {
            await deleteRows({
              projectRef: project?.ref,
              connectionString: project?.connectionString,
              table,
              rows,
            })

            dispatch({ type: 'REMOVE_ROWS', payload: { rowIdxs } })
            dispatch({
              type: 'SELECTED_ROWS_CHANGE',
              payload: { selectedRows: new Set() },
            })
          } catch (error) {
            if (state.onError) state.onError(error)
          }
        }
      },
    })
  }

  const [isExporting, setIsExporting] = useState(false)

  async function onRowsExportCSV() {
    setIsExporting(true)

    if (allRowsSelected && totalRows > MAX_EXPORT_ROW_COUNT) {
      ui.setNotification({
        category: 'error',
        message: `Sorry! We're unable to support exporting of CSV for row counts larger than ${MAX_EXPORT_ROW_COUNT.toLocaleString()} at the moment.`,
      })
      return setIsExporting(false)
    }

    const rows = allRowsSelected
      ? await state.rowService!.fetchAllData(filters, sorts)
      : allRows.filter((x) => selectedRows.has(x.idx))

    const csv = exportRowsToCsv(state.table!.columns, rows)
    const csvData = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    saveAs(csvData, `${state.table!.name}_rows.csv`)
    setIsExporting(false)
  }

  function deselectRows() {
    dispatch({
      type: 'SELECTED_ROWS_CHANGE',
      payload: { selectedRows: new Set() },
    })
  }

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-3">
        <Button
          type="default"
          style={{ padding: '3px' }}
          icon={<IconX size="tiny" strokeWidth={2} />}
          onClick={deselectRows}
        />
        <span className="text-xs text-scale-1200">
          {allRowsSelected
            ? `${totalRows} rows selected`
            : selectedRows.size > 1
            ? `${selectedRows.size} rows selected`
            : `${selectedRows.size} row selected`}
        </span>
        {!allRowsSelected && totalRows > allRows.length && (
          <Button type="link" onClick={() => onSelectAllRows()}>
            Select all {totalRows} rows
          </Button>
        )}
      </div>
      <div className="h-[20px] border-r border-gray-700" />
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          size="tiny"
          icon={<IconDownload />}
          loading={isExporting}
          disabled={isExporting}
          onClick={onRowsExportCSV}
        >
          Export to CSV
        </Button>
        {editable && (
          <Button
            type="default"
            size="tiny"
            icon={<IconTrash size="tiny" />}
            onClick={onRowsDelete}
          >
            {allRowsSelected
              ? `Delete ${totalRows} rows`
              : selectedRows.size > 1
              ? `Delete ${selectedRows.size} rows`
              : `Delete ${selectedRows.size} row`}
          </Button>
        )}
      </div>
    </div>
  )
}
