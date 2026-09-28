# AWS cost cleanup

Scope approved by the user: remove resources that can generate charges, while keeping the AWS account, IAM, default VPCs, empty S3 bucket, and empty ECR repositories.

RDS data policy: delete `database-1` in `us-east-2` without a final snapshot and remove automated backups.

- [x] Delete RDS instance `database-1` and automated backups in `us-east-2` (AWS accepted the request; final absence is checked at close).
- [x] Terminate stopped EC2 instances and verify their `DeleteOnTermination` EBS volumes are removed:
  - `i-0bcbcc8b8bba8fc87` in `us-east-1`
  - `i-000df7135ce9ffcce` in `us-east-1`
  - `i-09150195078a89f73` in `us-east-2`
- [x] Release unassociated Elastic IP `32.196.207.97` (`eipalloc-0d4f6e1c8c413f94f`) in `us-east-1` (verified allocation no longer exists).
- [x] Delete CloudWatch log groups `/ecs/asistencia-backend` and `RDSOSMetrics` in `us-east-2` (verified both are absent).
- [x] Re-inventory selected resources and report any residuals or pending deletion states: RDS `database-1` and its automated snapshots are absent; no non-terminated EC2, EBS volumes, Elastic IPs, NAT gateways, or CloudWatch log groups with stored bytes remain in the enabled regions. The empty S3 bucket and empty ECR repositories remain intentionally.

No source repository code is changed by this operation. AWS mutations are executed only after the explicit scope and RDS data confirmation above.
