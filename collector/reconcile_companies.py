"""One-off maintenance: merge duplicate companies and hide unnamed-employer
events, using the current name rules. Run via the "Company Reconcile" workflow.
Reprocesses nothing, so it is quick."""
from match import get_db_connection, reconcile_companies

if __name__ == "__main__":
    conn = get_db_connection()
    try:
        reconcile_companies(conn)
        print("Reconcile complete.", flush=True)
    finally:
        conn.close()
